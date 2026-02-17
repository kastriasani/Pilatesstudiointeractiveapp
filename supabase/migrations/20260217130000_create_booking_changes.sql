-- Audit trail for user-initiated booking changes (cancellations, reschedules)
CREATE TABLE booking_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  change_type TEXT NOT NULL,        -- 'cancelled', 'rescheduled'
  old_date_key TEXT,
  old_time_slot TEXT,
  new_date_key TEXT,
  new_time_slot TEXT,
  user_name TEXT,
  user_surname TEXT,
  package_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_booking_changes_created_at ON booking_changes(created_at DESC);
