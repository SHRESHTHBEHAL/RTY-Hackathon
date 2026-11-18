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
];
