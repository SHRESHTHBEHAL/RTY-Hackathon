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
];
