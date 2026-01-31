-- Phase 0D: Atomic reservation creation RPC
-- Solves race conditions for capacity, duplicates, and package decrement

-- 1. Add package_id FK to reservations table
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES user_packages(id);
CREATE INDEX IF NOT EXISTS idx_reservations_package_id ON reservations(package_id);

-- 2. Create atomic reservation function
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
  p_partner_surname TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_seats_needed INT;
  v_seats_occupied INT;
  v_has_private BOOLEAN;
  v_package RECORD;
  v_reservation_id UUID;
  v_status TEXT;
BEGIN
  -- Calculate seats needed based on service_type
  v_seats_needed := CASE p_service_type
    WHEN 'individual' THEN 4
    WHEN 'duo' THEN 2
    ELSE 1
  END;

  -- Lock and check capacity (atomic)
  SELECT
    COALESCE(SUM(CASE service_type WHEN 'duo' THEN 2 ELSE 1 END), 0),
    COALESCE(BOOL_OR(service_type IN ('individual', 'duo')), false)
  INTO v_seats_occupied, v_has_private
  FROM reservations
  WHERE date_key = p_date_key
    AND time_slot = p_time_slot
    AND reservation_status IN ('confirmed', 'attended')
  FOR UPDATE;

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
      AND date_key = p_date_key
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

    IF v_package.status != 'active' THEN
      RETURN jsonb_build_object('error', 'Package not active');
    END IF;

    v_status := 'confirmed';
  ELSE
    v_status := 'pending';
  END IF;

  -- Insert reservation
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
    created_at,
    updated_at
  ) VALUES (
    p_user_email,
    p_date_key,
    p_time_slot,
    v_status,
    CASE WHEN p_package_id IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
    p_name,
    p_surname,
    p_mobile,
    p_instructor,
    p_package_type,
    p_service_type,
    p_package_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_reservation_id;

  -- Decrement package sessions (if applicable)
  IF p_package_id IS NOT NULL THEN
    UPDATE user_packages
    SET remaining_sessions = remaining_sessions - 1,
        status = CASE WHEN remaining_sessions - 1 = 0 THEN 'fully_used' ELSE status END,
        updated_at = NOW()
    WHERE id = p_package_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql;
