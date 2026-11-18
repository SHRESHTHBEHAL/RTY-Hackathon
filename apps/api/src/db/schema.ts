/**
 * All tables, as idempotent DDL applied by migrate(). Amounts are bigint micros.
 * Every table holding business data has an `env` column. List tables carry a
 * `seq` used as the opaque pagination cursor (newest first).
 */
export const SCHEMA: string[] = [
  // --- Ledger (Task 2) ---
  `create table if not exists ledger_accounts (
    id bigserial primary key,
    env text not null check (env in ('test','live')),
    kind text not null check (kind in ('external','unallocated','available','held','owed','fees','settling','withdrawing')),
    owner_id text not null,
    balance_micros bigint not null default 0,
    unique (env, kind, owner_id)
  )`,
  `create table if not exists postings (
    id text primary key,
    seq bigserial not null,
    env text not null,
    type text not null,
    ref text not null,
    business_id text,
    wallet_id text,
    counterparty text,
    amount_micros bigint,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists postings_business_idx on postings (env, business_id, seq desc)`,
  `create table if not exists entries (
    id bigserial primary key,
    posting_id text not null references postings(id),
    account_id bigint not null references ledger_accounts(id),
    delta_micros bigint not null
  )`,

  // --- Accounts, businesses, sellers, keys (Task 3) ---
  `create table if not exists accounts (
    id text primary key,
    env text not null,
    email text not null,
    name text not null,
    kind text not null check (kind in ('business','seller')),
    password_hash text not null,
    business_id text,
    seller_id text,
    created_at timestamptz not null default now()
  )`,
  `create unique index if not exists accounts_email_idx on accounts (lower(email))`,
  `create table if not exists businesses (
    id text primary key,
    env text not null,
    name text not null,
    account_id text not null,
    chain_key text not null unique,
    verified boolean not null default false,
    withdraw_address text,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists sellers (
    id text primary key,
    env text not null,
    name text not null,
    account_id text not null,
    chain_key text not null unique,
    payout_address text,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists api_keys (
    id text primary key,
    seq bigserial not null,
    env text not null,
    holder_kind text not null check (holder_kind in ('business','seller','agent')),
    business_id text,
    seller_id text,
    agent_id text,
    label text not null,
    key_hash text not null unique,
    last_four text not null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz
  )`,

  // --- Agents and wallets (Task 4) ---
  `create table if not exists agents (
    id text primary key,
    seq bigserial not null,
    env text not null,
    business_id text not null references businesses(id),
    name text not null,
    status text not null default 'active' check (status in ('active','disabled')),
    wallet_id text not null unique,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists agents_business_idx on agents (env, business_id, seq desc)`,
  `create table if not exists wallets (
    id text primary key,
    env text not null,
    agent_id text not null unique,
    business_id text not null,
    created_at timestamptz not null default now()
  )`,

  // --- Top-ups and deposits (Task 5) ---
  `create table if not exists topups (
    id text primary key,
    seq bigserial not null,
    env text not null,
    business_id text not null,
    amount_micros bigint not null check (amount_micros > 0),
    method text not null check (method in ('test','ramp')),
    status text not null check (status in ('pending','confirmed','failed')),
    tx_hash text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists topups_business_idx on topups (env, business_id, seq desc)`,
  `create table if not exists chain_cursor (
    name text primary key,
    last_block bigint not null
  )`,
  `create table if not exists deposits_seen (
    tx_hash text not null,
    log_index integer not null,
    business_id text,
    amount_micros bigint not null,
    block_number bigint not null,
    created_at timestamptz not null default now(),
    primary key (tx_hash, log_index)
  )`,

  // --- Credentials (Task 6) ---
  `create table if not exists signing_keys (
    id text primary key,
    kid text not null,
    private_jwk jsonb not null,
    public_jwk jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists credentials (
    id text primary key,
    seq bigserial not null,
    env text not null,
    agent_id text not null,
    wallet_id text not null,
    business_id text not null,
    seller_id text not null,
    max_micros bigint not null check (max_micros > 0),
    remaining_micros bigint not null check (remaining_micros >= 0),
    status text not null check (status in ('active','released','expired','exhausted')),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists credentials_active_idx on credentials (expires_at) where status = 'active'`,

  // --- Charges and idempotency (Task 7) ---
  `create table if not exists charges (
    id text primary key,
    seq bigserial not null,
    env text not null,
    credential_id text,
    mandate_id text,
    seller_id text not null,
    agent_id text not null,
    business_id text not null,
    wallet_id text not null,
    amount_micros bigint not null check (amount_micros > 0),
    fee_micros bigint not null check (fee_micros >= 0 and fee_micros <= amount_micros),
    refunded_micros bigint not null default 0,
    description text,
    batch_id text,
    settled_at timestamptz,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists charges_seller_idx on charges (env, seller_id, seq desc)`,
  `create index if not exists charges_agent_idx on charges (env, agent_id, seq desc)`,
  `create index if not exists charges_unsettled_idx on charges (env, seq) where batch_id is null`,
  `create table if not exists idempotency_keys (
    scope text not null,
    key text not null,
    request_hash text not null,
    status_code integer,
    response_body text,
    created_at timestamptz not null default now(),
    primary key (scope, key)
  )`,
  `create table if not exists payouts (
    id text primary key,
    seq bigserial not null,
    env text not null,
    seller_id text not null,
    batch_id text not null,
    amount_micros bigint not null,
    status text not null check (status in ('pending','sent')),
    tx_hash text,
    created_at timestamptz not null default now(),
    unique (batch_id, seller_id)
  )`,

  // --- Settlement (Task 9) ---
  `create table if not exists settlement_batches (
    id text primary key,
    env text not null,
    status text not null check (status in ('pending','submitted','confirmed','failed')),
    gross_micros bigint not null,
    fee_micros bigint not null,
    tx_hash text,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  // Only one batch per environment may be in flight at a time.
  `create unique index if not exists settlement_one_open_idx on settlement_batches (env) where status in ('pending','submitted')`,
  `create table if not exists settlement_items (
    batch_id text not null references settlement_batches(id),
    business_id text not null,
    seller_id text not null,
    gross_micros bigint not null,
    fee_micros bigint not null,
    primary key (batch_id, business_id, seller_id)
  )`,

  // --- Spending rules (Task 11) ---
  `create table if not exists agent_rules (
    agent_id text primary key,
    env text not null,
    per_payment_max bigint,
    daily_max bigint,
    allowed_seller_ids text[],
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists charges_agent_day_idx on charges (agent_id, created_at)`,

  // --- Seller services (Task 8) ---
  `create table if not exists services (
    id text primary key,
    seq bigserial not null,
    env text not null,
    seller_id text not null,
    name text not null,
    description text not null,
    price_note text not null,
    url text not null,
    active boolean not null default true,
    created_at timestamptz not null default now()
  )`,
];
