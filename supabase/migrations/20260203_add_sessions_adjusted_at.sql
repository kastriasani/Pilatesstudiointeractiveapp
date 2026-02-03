-- Add sessions_adjusted_at column for tracking manual session adjustments
-- Run in Supabase Dashboard > SQL Editor

-- Add to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS sessions_adjusted_at TIMESTAMPTZ;

-- Add to user_packages table
ALTER TABLE user_packages
ADD COLUMN IF NOT EXISTS sessions_adjusted_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN users.sessions_adjusted_at IS 'Timestamp of last manual session adjustment by admin';
COMMENT ON COLUMN user_packages.sessions_adjusted_at IS 'Timestamp of last manual session adjustment by admin';
