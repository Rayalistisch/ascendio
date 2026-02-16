-- =============================================
-- Ascendio v4 Migration
-- Paid tiers and subscription/paywall state
-- =============================================

create table if not exists asc_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier text not null default 'starter',
  status text not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  credits_monthly integer not null default 0,
  credits_remaining integer not null default 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asc_subscriptions_status on asc_subscriptions(status);

alter table asc_subscriptions enable row level security;

create policy "Users can view own subscriptions" on asc_subscriptions
  for select using (auth.uid() = user_id);

create policy "Users can manage own subscriptions" on asc_subscriptions
  for all using (auth.uid() = user_id);
