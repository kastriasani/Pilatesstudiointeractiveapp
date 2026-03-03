-- Drop the old 13-arg create_reservation overload (dead code since slot_index migration).
-- The current 14-arg version (with p_slot_index) is the only one called by the edge function.
DROP FUNCTION IF EXISTS create_reservation(text, uuid, text, text, text, text, text, text, text, text, text, text, boolean);

-- Fix cancel_reservation RPC: change "v_package IS NOT NULL" to "v_package.id IS NOT NULL".
--
-- ROOT CAUSE: In PL/pgSQL, "RECORD IS NOT NULL" returns TRUE only when ALL fields are non-null.
-- user_packages has 9 nullable columns (redeemed_coupon_code, payment_id, sessions_adjusted_at, etc.),
-- so "v_package IS NOT NULL" always evaluated to FALSE, silently skipping the sessions_booked cleanup.
-- This caused remaining_sessions to never be restored on cancel, making users appear "frozen".
--
-- Fix: check a specific non-nullable column (v_package.id) instead of the whole record.
DROP FUNCTION IF EXISTS cancel_reservation(uuid, uuid);

CREATE OR REPLACE FUNCTION cancel_reservation(p_reservation_id UUID, p_package_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_reservation RECORD;
  v_package RECORD;
  v_new_booked TEXT[];
  v_new_remaining INT;
BEGIN
  -- Lock and fetch reservation
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  -- Idempotent: already cancelled = no-op success
  IF v_reservation.reservation_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'new_remaining', NULL
    );
  END IF;

  -- Update reservation status to cancelled
  UPDATE reservations
  SET reservation_status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- Update package if linked (use reservation's actual package_id for safety, ignore caller's p_package_id)
  IF v_reservation.package_id IS NOT NULL THEN
    SELECT * INTO v_package
    FROM user_packages
    WHERE id = v_reservation.package_id
    FOR UPDATE;

    -- FIX: use v_package.id IS NOT NULL instead of v_package IS NOT NULL
    -- (PL/pgSQL RECORD IS NOT NULL requires ALL fields non-null, which fails
    -- when any nullable column like redeemed_coupon_code is NULL)
    IF v_package.id IS NOT NULL THEN
      -- Remove from sessions_booked ONLY (never touch sessions_attended on cancel)
      v_new_booked := array_remove(COALESCE(v_package.sessions_booked, '{}'::text[]), p_reservation_id::text);

      -- Correct formula: remaining = total - booked - attended
      v_new_remaining := v_package.total_sessions
                       - COALESCE(array_length(v_new_booked, 1), 0)
                       - COALESCE(array_length(v_package.sessions_attended, 1), 0);

      -- Clamp to 0 minimum (safety)
      IF v_new_remaining < 0 THEN
        v_new_remaining := 0;
      END IF;

      UPDATE user_packages
      SET sessions_booked = v_new_booked,
          remaining_sessions = v_new_remaining,
          package_status = CASE
            WHEN v_new_remaining > 0
              AND v_package.activation_status = 'activated'
              AND v_package.package_status = 'fully_used'
            THEN 'active'
            ELSE v_package.package_status
          END,
          updated_at = NOW()
      WHERE id = v_reservation.package_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'new_remaining', v_new_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation(uuid, uuid) TO anon, authenticated, service_role;
