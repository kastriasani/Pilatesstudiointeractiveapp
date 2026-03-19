-- Add class_type column to time_slots table
-- Values: 'group' (default), 'individual', 'duo'
-- Existing slots automatically become 'group' via the DEFAULT.
ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'group';

-- Replace create_reservation RPC with class-type-based capacity logic.
-- Changes from previous version (20260303120000):
--   1. NEW: Looks up class_type + max_capacity from time_slots (defaults to group/4)
--   2. NEW: Validates service_type matches slot class_type
--   3. CHANGED: Simple COUNT(*) capacity instead of weighted seats (individual=4, duo=2)
--   4. REMOVED: v_has_private / "Slot blocked by private session" logic
-- Everything else (alt date key, locking, friend booking, package validation,
-- first-session logic, INSERT with payment_status, package UPDATE with dedup) is UNCHANGED.
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
  v_class_type TEXT;
  v_max_capacity INT;
  v_booked INT;
  v_package RECORD;
  v_reservation_id UUID;
  v_status TEXT;
  v_alt_date_key TEXT;
  v_is_friend_booking BOOLEAN := FALSE;
BEGIN
  -- ===== ALT DATE KEY (unchanged from original) =====
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

  -- ===== NEW: CLASS TYPE LOOKUP =====
  SELECT ts.class_type, ts.max_capacity
  INTO v_class_type, v_max_capacity
  FROM time_slots ts
  WHERE ts.date = p_date_key AND ts.start_time = p_time_slot
  LIMIT 1;

  -- Default to group/4 if no time_slots row (backwards compat)
  v_class_type := COALESCE(v_class_type, 'group');
  v_max_capacity := COALESCE(v_max_capacity, 4);

  -- ===== NEW: CLASS TYPE VALIDATION =====
  IF v_class_type = 'group' AND p_service_type NOT IN ('single', 'package') THEN
    RETURN jsonb_build_object('error', 'This slot is for group classes only');
  END IF;
  IF v_class_type = 'individual' AND p_service_type != 'individual' THEN
    RETURN jsonb_build_object('error', 'This slot is for Individual training only');
  END IF;
  IF v_class_type = 'duo' AND p_service_type != 'duo' THEN
    RETURN jsonb_build_object('error', 'This slot is for DUO training only');
  END IF;

  -- ===== LOCKING (unchanged) =====
  PERFORM 1
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended')
  FOR UPDATE;

  -- ===== NEW: SIMPLE COUNT CAPACITY (replaces weighted seats + v_has_private) =====
  SELECT COUNT(*)
  INTO v_booked
  FROM reservations
  WHERE date_key IN (p_date_key, v_alt_date_key)
    AND time_slot = p_time_slot
    AND reservation_status IN ('pending', 'confirmed', 'attended');

  IF v_booked >= v_max_capacity THEN
    RETURN jsonb_build_object('error', 'Insufficient capacity');
  END IF;

  -- ===== FRIEND BOOKING CHECK (unchanged — allows duplicate, marks as friend) =====
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE user_email = p_user_email
      AND date_key IN (p_date_key, v_alt_date_key)
      AND time_slot = p_time_slot
      AND reservation_status IN ('pending', 'confirmed')
  ) THEN
    v_is_friend_booking := TRUE;
  END IF;

  -- ===== PACKAGE VALIDATION (unchanged from original) =====
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
      IF v_package.package_status NOT IN ('active', 'pending') THEN
        RETURN jsonb_build_object('error', 'Package not active');
      END IF;
      -- Active packages get confirmed reservations; pending get pending reservations.
      v_status := CASE WHEN v_package.package_status = 'active' THEN 'confirmed' ELSE 'pending' END;
    END IF;
  ELSE
    v_status := 'pending';
  END IF;

  -- ===== INSERT RESERVATION (unchanged — includes payment_status) =====
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

  -- ===== PACKAGE UPDATE (unchanged — split first/subsequent, TEXT[] with dedup) =====
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
