-- Fix two bugs:
-- 1. Duplicate booking regression: migration 20260302120000 replaced the RPC with a hard
--    duplicate block, losing the friend-booking logic from 20260207140000. This restores
--    the "detect duplicate → set is_friend_booking = TRUE" behavior.
-- 2. Session slot display shifts after cancel + rebook: slotIndex was derived from array
--    position in sessions_booked, so cancel (array_remove) shifted all subsequent indices.
--    Now we store slot_index directly on the reservation row.

-- A. Add slot_index column to reservations
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS slot_index INTEGER;

-- B. Replace create_reservation RPC: combines friend-booking logic + sessions_booked array
--    maintenance + pending package support + NEW slot_index parameter
CREATE OR REPLACE FUNCTION create_reservation(
  p_user_email TEXT,
  p_package_id UUID,
  p_service_type TEXT,
  p_date_key TEXT,
  p_time_slot TEXT,
  p_instructor TEXT,
  p_name TEXT,
  p_surname TEXT,
  p_mobile TEXT,
  p_package_type TEXT DEFAULT NULL,
  p_partner_name TEXT DEFAULT NULL,
  p_partner_surname TEXT DEFAULT NULL,
  p_is_first_session BOOLEAN DEFAULT FALSE,
  p_slot_index INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_seats_needed INT;
  v_seats_occupied INT;
  v_has_private BOOLEAN;
  v_package RECORD;
  v_reservation_id UUID;
  v_status TEXT;
  v_alt_date_key TEXT;
  v_is_friend_booking BOOLEAN := FALSE;
BEGIN
  -- Calculate seats needed based on service_type
  v_seats_needed := CASE p_service_type
    WHEN 'individual' THEN 4
    WHEN 'duo' THEN 2
    ELSE 1
  END;

  -- Derive alternate date key format for backwards compatibility
  IF p_date_key ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_alt_date_key := CAST(EXTRACT(MONTH FROM p_date_key::date) AS INTEGER)::TEXT
                      || '-' ||
                      CAST(EXTRACT(DAY FROM p_date_key::date) AS INTEGER)::TEXT;
  ELSIF p_date_key ~ '^\d{1,2}-\d{1,2}$' THEN
    v_alt_date_key := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                      || '-' || lpad(split_part(p_date_key, '-', 1), 2, '0')
                      || '-' || lpad(split_part(p_date_key, '-', 2), 2, '0');
  ELSE
    v_alt_date_key := p_date_key;
  END IF;

  -- Lock rows first (FOR UPDATE requires non-aggregate query)
  PERFORM 1
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended')
  FOR UPDATE;

  -- Now calculate capacity (rows are locked)
  SELECT
    COALESCE(SUM(
      CASE service_type
        WHEN 'individual' THEN 4
        WHEN 'duo' THEN 2
        ELSE 1
      END
    ), 0),
    COALESCE(BOOL_OR(service_type IN ('individual', 'duo')), false)
  INTO v_seats_occupied, v_has_private
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended');

  -- Capacity validation
  IF v_has_private THEN
    RETURN jsonb_build_object('error', 'Slot blocked by private session');
  END IF;

  IF (4 - COALESCE(v_seats_occupied, 0)) < v_seats_needed THEN
    RETURN jsonb_build_object('error', 'Insufficient capacity');
  END IF;

  -- Check if this is a friend booking (same user already has a booking at this slot)
  -- Instead of blocking, we allow it and mark is_friend_booking = TRUE
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE user_email = p_user_email
      AND date_key IN (p_date_key, v_alt_date_key)
      AND time_slot = p_time_slot
      AND reservation_status IN ('pending', 'confirmed')
  ) THEN
    v_is_friend_booking := TRUE;
  END IF;

  -- Package validation (if applicable)
  IF p_package_id IS NOT NULL THEN
    SELECT * INTO v_package
    FROM user_packages
    WHERE id = p_package_id
    FOR UPDATE;

    IF v_package IS NULL THEN
      RETURN jsonb_build_object('error', 'Package not found');
    END IF;

    IF v_package.remaining_sessions <= 0 THEN
      RETURN jsonb_build_object('error', 'No remaining sessions');
    END IF;

    IF p_is_first_session THEN
      -- First-session path: package must be pending with no prior first session
      IF v_package.package_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Package is not in pending state');
      END IF;
      IF v_package.first_reservation_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'First session already booked');
      END IF;
      v_status := 'pending';
    ELSE
      -- Subsequent-session path: allow both active and pending packages.
      -- pending = renewed package awaiting admin activation (max 2 bookings enforced in app layer).
      IF v_package.package_status NOT IN ('active', 'pending') THEN
        RETURN jsonb_build_object('error', 'Package not active');
      END IF;
      -- Active packages get confirmed reservations; pending get pending reservations.
      v_status := CASE WHEN v_package.package_status = 'active' THEN 'confirmed' ELSE 'pending' END;
    END IF;
  ELSE
    v_status := 'pending';
  END IF;

  -- Insert reservation with friend booking flag and slot_index
  INSERT INTO reservations (
    user_email, date_key, time_slot, reservation_status, payment_status,
    name, surname, mobile, instructor, package_type, service_type,
    package_id, is_friend_booking, slot_index, created_at, updated_at
  ) VALUES (
    p_user_email, p_date_key, p_time_slot, v_status,
    CASE WHEN p_package_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
    p_name, p_surname, p_mobile, p_instructor, p_package_type,
    p_service_type, p_package_id, v_is_friend_booking, p_slot_index,
    NOW(), NOW()
  ) RETURNING id INTO v_reservation_id;

  -- Update package atomically: decrement remaining + append to sessions_booked
  -- Note: package_status is NOT set to fully_used here. That transition happens
  -- in the backend when sessions are actually attended/no-showed, not just booked.
  IF p_package_id IS NOT NULL THEN
    IF p_is_first_session THEN
      UPDATE user_packages
      SET first_reservation_id = v_reservation_id,
          remaining_sessions = remaining_sessions - 1,
          sessions_booked = CASE
            WHEN v_reservation_id::text = ANY(COALESCE(sessions_booked, '{}'))
            THEN sessions_booked
            ELSE array_append(COALESCE(sessions_booked, '{}'), v_reservation_id::text)
          END,
          updated_at = NOW()
      WHERE id = p_package_id;
    ELSE
      UPDATE user_packages
      SET remaining_sessions = remaining_sessions - 1,
          sessions_booked = CASE
            WHEN v_reservation_id::text = ANY(COALESCE(sessions_booked, '{}'))
            THEN sessions_booked
            ELSE array_append(COALESCE(sessions_booked, '{}'), v_reservation_id::text)
          END,
          updated_at = NOW()
      WHERE id = p_package_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'status', v_status,
    'is_friend_booking', v_is_friend_booking
  );
END;
$$ LANGUAGE plpgsql;

-- C. Backfill existing reservations with slot_index based on creation order per package
-- For each package, order its reservations by created_at and assign sequential slot_index
UPDATE reservations r
SET slot_index = sub.rn
FROM (
  SELECT r2.id,
         ROW_NUMBER() OVER (
           PARTITION BY r2.package_id
           ORDER BY r2.created_at ASC
         ) - 1 AS rn
  FROM reservations r2
  WHERE r2.package_id IS NOT NULL
    AND r2.slot_index IS NULL
) sub
WHERE r.id = sub.id;
