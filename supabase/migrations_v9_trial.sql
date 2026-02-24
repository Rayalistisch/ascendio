-- Add trial_ends_at column to track 7-day free trial expiry
ALTER TABLE asc_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
