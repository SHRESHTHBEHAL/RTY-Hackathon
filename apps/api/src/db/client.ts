import postgres from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = postgres.Sql<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = postgres.TransactionSql<any>;

/** Postgres client. int8 columns come back as bigint; never as JS numbers. */
export function createSql(url: string, opts: { max?: number } = {}): Db {
  return postgres(url, {
    max: opts.max ?? 10,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
  });
}
