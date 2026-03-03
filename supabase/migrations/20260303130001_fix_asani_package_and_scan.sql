-- Part 2: Data fix for asani.kastri@gmail.com
-- Package cc39da3c has remaining_sessions=0 but all 8 sessions_booked entries
-- reference cancelled reservations. Clear stale sessions_booked and recalc remaining.

-- Step 1: Fix user_packages — clear stale sessions_booked, recalc remaining
UPDATE user_packages
SET sessions_booked = '{}',
    remaining_sessions = total_sessions - COALESCE(array_length(sessions_attended, 1), 0),
    updated_at = NOW()
WHERE id = 'cc39da3c-a952-4599-b123-f22d6d1b22d6';

-- Step 2: Sync users table
UPDATE users
SET remaining_sessions = (
      SELECT total_sessions - COALESCE(array_length(sessions_attended, 1), 0)
      FROM user_packages
      WHERE id = 'cc39da3c-a952-4599-b123-f22d6d1b22d6'
    ),
    used_sessions = (
      SELECT COALESCE(array_length(sessions_attended, 1), 0)
      FROM user_packages
      WHERE id = 'cc39da3c-a952-4599-b123-f22d6d1b22d6'
    ),
    updated_at = NOW()
WHERE email = 'asani.kastri@gmail.com';

-- Step 4: Fix ALL other packages with same issue (sessions_booked containing cancelled/orphaned reservation IDs)
-- For each affected package: remove cancelled/orphaned IDs from sessions_booked and recalc remaining.
WITH stale_packages AS (
  SELECT up.id AS pkg_id, up.user_email, up.total_sessions,
         COALESCE(array_length(up.sessions_attended, 1), 0) AS attended_count,
         up.sessions_booked,
         ARRAY(
           SELECT bid FROM unnest(up.sessions_booked) AS bid
           INNER JOIN reservations r ON r.id = bid::uuid
           WHERE r.reservation_status NOT IN ('cancelled')
         ) AS clean_booked
  FROM user_packages up
  WHERE up.sessions_booked IS NOT NULL
    AND array_length(up.sessions_booked, 1) > 0
    AND up.id != 'cc39da3c-a952-4599-b123-f22d6d1b22d6'  -- already fixed above
    AND EXISTS (
      SELECT 1 FROM unnest(up.sessions_booked) AS bid
      LEFT JOIN reservations r ON r.id = bid::uuid
      WHERE r.reservation_status = 'cancelled' OR r.id IS NULL
    )
)
UPDATE user_packages up
SET sessions_booked = sp.clean_booked,
    remaining_sessions = sp.total_sessions - COALESCE(array_length(sp.clean_booked, 1), 0) - sp.attended_count,
    updated_at = NOW()
FROM stale_packages sp
WHERE up.id = sp.pkg_id;

-- Also sync the users table for any affected packages
WITH stale_users AS (
  SELECT DISTINCT up.user_email,
         up.total_sessions - COALESCE(array_length(up.sessions_booked, 1), 0) - COALESCE(array_length(up.sessions_attended, 1), 0) AS remaining,
         COALESCE(array_length(up.sessions_booked, 1), 0) + COALESCE(array_length(up.sessions_attended, 1), 0) AS used
  FROM user_packages up
  WHERE up.package_status IN ('active', 'pending')
    AND up.user_email != 'asani.kastri@gmail.com'  -- already fixed above
)
UPDATE users u
SET remaining_sessions = su.remaining,
    used_sessions = su.used,
    updated_at = NOW()
FROM stale_users su
WHERE u.email = su.user_email
  AND (u.remaining_sessions != su.remaining OR u.used_sessions != su.used);
