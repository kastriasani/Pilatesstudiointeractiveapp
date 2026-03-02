-- Fix: only mark package as fully_used when all sessions are actually attended/consumed,
-- not when they are merely booked. Previously, booking the last session immediately set
-- package_status = 'fully_used', causing "Completed" to display for users with future classes.
-- Now the backend marks fully_used after attendance/no-show, when no active reservations remain.

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
  v_alt_date_key TEXT;
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

  -- Duplicate check (same user, same slot, active status)
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE user_email = p_user_email
      AND date_key IN (p_date_key, v_alt_date_key)
      AND time_slot = p_time_slot
      AND reservation_status IN ('pending', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('error', 'Duplicate booking');
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

  -- Insert reservation
  INSERT INTO reservations (
    user_email, date_key, time_slot, reservation_status, payment_status,
    name, surname, mobile, instructor, package_type, service_type,
    package_id, created_at, updated_at
  ) VALUES (
    p_user_email, p_date_key, p_time_slot, v_status,
    CASE WHEN p_package_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
    p_name, p_surname, p_mobile, p_instructor, p_package_type,
    p_service_type, p_package_id, NOW(), NOW()
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
            THEN sessions_booked  -- already present, skip (idempotent)
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
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql;
