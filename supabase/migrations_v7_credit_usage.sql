-- ============================================================
-- Migration v7: Credit usage audit trail + atomic deduction
-- ============================================================

-- 1. Usage history table
CREATE TABLE IF NOT EXISTS asc_credit_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        text NOT NULL,
  credits       integer NOT NULL,
  reference_id  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_usage_user    ON asc_credit_usage(user_id);
CREATE INDEX idx_credit_usage_created ON asc_credit_usage(created_at);

ALTER TABLE asc_credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit usage"
  ON asc_credit_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Atomic credit deduction function
--    Returns TRUE if credits were deducted, FALSE if insufficient.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id uuid,
  p_cost    integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE asc_subscriptions
  SET credits_remaining = credits_remaining - p_cost,
      updated_at = now()
  WHERE user_id = p_user_id
    AND credits_remaining >= p_cost;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;
