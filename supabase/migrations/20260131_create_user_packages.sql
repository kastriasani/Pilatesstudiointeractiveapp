-- Phase 0C: Create user_packages table (SIMPLIFIED)
-- Run in Supabase Dashboard > SQL Editor

-- Drop old tables if they exist
DROP TABLE IF EXISTS activation_codes CASCADE;
DROP TABLE IF EXISTS user_packages CASCADE;

-- Create user_packages table
CREATE TABLE user_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  package_type TEXT NOT NULL CHECK (package_type IN (
    'package8', 'package10', 'package12',
    'individual1', 'individual8', 'individual12',
    'duo1', 'duo8', 'duo12'
  )),
  total_sessions INTEGER NOT NULL DEFAULT 0,
  base_sessions INTEGER NOT NULL DEFAULT 0,
  bonus_classes INTEGER NOT NULL DEFAULT 0,
  remaining_sessions INTEGER NOT NULL DEFAULT 0,
  sessions_booked TEXT[] DEFAULT '{}',
  sessions_attended TEXT[] DEFAULT '{}',
  redeemed_coupon_code TEXT,
  package_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (package_status IN ('pending', 'active', 'fully_used', 'expired', 'cancelled')),
  activation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (activation_status IN ('pending', 'activated', 'expired')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'partially_paid', 'refunded')),
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activation_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  first_reservation_id TEXT,
  payment_id TEXT,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_packages_user_email ON user_packages(user_email);
CREATE INDEX idx_user_packages_package_status ON user_packages(package_status);
CREATE INDEX idx_user_packages_created_at ON user_packages(created_at DESC);
