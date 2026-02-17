-- Fix: reservation payment_status should reflect actual package payment_status
-- Previously, any booking with a package_id was blindly marked 'paid',
-- even for first-session bookings on unpaid pending packages.
-- Now it uses the package's actual payment_status.

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
  p_is_first_session BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
  v_seats_needed INT;
  v_seats_occupied INT;
  v_has_private BOOLEAN;
  v_package RECORD;
  v_reservation_id UUID;
  v_status TEXT;
  v_payment_status TEXT;
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
  -- ISO "2026-02-05" -> legacy "2-5", legacy "2-5" -> ISO "2026-02-05"
  IF p_date_key ~ '^\d{4}-\d{2}-\d{2}$' THEN
    -- ISO -> legacy: strip leading zeros and year
    v_alt_date_key := CAST(EXTRACT(MONTH FROM p_date_key::date) AS INTEGER)::TEXT
                      || '-' ||
                      CAST(EXTRACT(DAY FROM p_date_key::date) AS INTEGER)::TEXT;
  ELSIF p_date_key ~ '^\d{1,2}-\d{1,2}$' THEN
    -- Legacy -> ISO: use current year
    v_alt_date_key := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                      || '-' || lpad(split_part(p_date_key, '-', 1), 2, '0')
                      || '-' || lpad(split_part(p_date_key, '-', 2), 2, '0');
  ELSE
    v_alt_date_key := p_date_key;
  END IF;

  -- Lock rows first (FOR UPDATE requires non-aggregate query)
  -- Include pending to prevent overbooking from concurrent single-session bookings
  -- Match both date key formats to catch all bookings for this date
  PERFORM 1
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended')
  FOR UPDATE;

  -- Now calculate capacity (rows are locked)
  -- Use correct seat counting: individual=4, duo=2, group=1
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
      -- First session: package must be pending, no prior first session
      IF v_package.package_status != 'pending' THEN
        RETURN jsonb_build_object('error', 'Package is not in pending state');
      END IF;
      IF v_package.first_reservation_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'First session already booked');
      END IF;
      v_status := 'pending';
    ELSE
      -- Normal package session: package must be active
      IF v_package.package_status != 'active' THEN
        RETURN jsonb_build_object('error', 'Package not active');
      END IF;
      v_status := 'confirmed';
    END IF;

    -- Use the package's actual payment_status instead of blindly marking 'paid'
    v_payment_status := COALESCE(v_package.payment_status, 'unpaid');
  ELSE
    v_status := 'pending';
    v_payment_status := 'unpaid';
  END IF;

  -- Insert reservation with friend booking flag
  INSERT INTO reservations (
    user_email,
    date_key,
    time_slot,
    reservation_status,
    payment_status,
    name,
    surname,
    mobile,
    instructor,
    package_type,
    service_type,
    package_id,
    is_friend_booking,
    created_at,
    updated_at
  ) VALUES (
    p_user_email,
    p_date_key,
    p_time_slot,
    v_status,
    v_payment_status,
    p_name,
    p_surname,
    p_mobile,
    p_instructor,
    p_package_type,
    p_service_type,
    p_package_id,
    v_is_friend_booking,
    NOW(),
    NOW()
  ) RETURNING id INTO v_reservation_id;

  -- Update package (if applicable)
  IF p_package_id IS NOT NULL THEN
    IF p_is_first_session THEN
      -- First session: set first_reservation_id + decrement
      UPDATE user_packages
      SET first_reservation_id = v_reservation_id,
          remaining_sessions = remaining_sessions - 1,
          updated_at = NOW()
      WHERE id = p_package_id;
    ELSE
      -- Normal session: decrement + mark fully_used if exhausted
      UPDATE user_packages
      SET remaining_sessions = remaining_sessions - 1,
          package_status = CASE WHEN remaining_sessions - 1 = 0 THEN 'fully_used' ELSE package_status END,
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

-- Data fix: correct existing reservations that were incorrectly marked 'paid'
-- when their linked package is still unpaid/pending
UPDATE reservations r
SET payment_status = 'unpaid', updated_at = NOW()
FROM user_packages p
WHERE r.package_id = p.id
  AND r.payment_status = 'paid'
  AND p.payment_status = 'unpaid';
