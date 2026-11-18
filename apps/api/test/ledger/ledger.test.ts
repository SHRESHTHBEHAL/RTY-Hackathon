import { beforeEach, describe, expect, it } from "vitest";
import { balanceOf, post } from "../../src/ledger/ledger.js";
import { ApiError } from "../../src/errors.js";
import { resetDb, testSql } from "../helpers.js";

const sql = testSql();
const ext = { kind: "external", ownerId: "vault" } as const;
const unalloc = { kind: "unallocated", ownerId: "biz_a" } as const;
const avail = { kind: "available", ownerId: "wal_a" } as const;
const held = { kind: "held", ownerId: "wal_a" } as const;

async function bal(kind: any, owner: string) {
  return sql.begin((tx) => balanceOf(tx, "test", kind, owner));
}

describe("ledger", () => {
  beforeEach(async () => {
    await resetDb(sql);
  });

  it("balanced posting moves balances", async () => {
    await sql.begin((tx) =>
      post(tx, "test", "topup", "top_1", [
        { account: ext, deltaMicros: -100n },
        { account: unalloc, deltaMicros: 100n },
      ]),
    );
    expect(await bal("external", "vault")).toBe(-100n);
    expect(await bal("unallocated", "biz_a")).toBe(100n);
  });

  it("unbalanced posting throws and changes nothing", async () => {
    await expect(
      sql.begin((tx) =>
        post(tx, "test", "topup", "x", [
          { account: ext, deltaMicros: -100n },
          { account: unalloc, deltaMicros: 99n },
        ]),
      ),
    ).rejects.toThrow();
    expect(await bal("unallocated", "biz_a")).toBe(0n);
    const [{ n }] = await sql`select count(*)::int as n from postings`;
    expect(n).toBe(0);
  });

  it("taking available below zero throws insufficient_funds and changes nothing", async () => {
    await sql.begin((tx) =>
      post(tx, "test", "seed", "s", [
        { account: ext, deltaMicros: -50n },
        { account: avail, deltaMicros: 50n },
      ]),
    );
    const err = await sql
      .begin((tx) =>
        post(tx, "test", "hold", "h", [
          { account: avail, deltaMicros: -60n },
          { account: held, deltaMicros: 60n },
        ]),
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("insufficient_funds");
    expect(await bal("available", "wal_a")).toBe(50n);
    expect(await bal("held", "wal_a")).toBe(0n);
  });

  it("external may go negative", async () => {
    await sql.begin((tx) =>
      post(tx, "test", "seed", "s", [
        { account: ext, deltaMicros: -1n },
        { account: avail, deltaMicros: 1n },
      ]),
    );
    expect(await bal("external", "vault")).toBe(-1n);
  });

  it("20 concurrent postings of 10 from 100: exactly 10 succeed", async () => {
    await sql.begin((tx) =>
      post(tx, "test", "seed", "s", [
        { account: ext, deltaMicros: -100n },
        { account: avail, deltaMicros: 100n },
      ]),
    );
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        sql.begin((tx) =>
          post(tx, "test", "hold", `h${i}`, [
            { account: avail, deltaMicros: -10n },
            { account: held, deltaMicros: 10n },
          ]),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(10);
    for (const r of results) if (r.status === "rejected") expect(r.reason.code).toBe("insufficient_funds");
    expect(await bal("available", "wal_a")).toBe(0n);
    expect(await bal("held", "wal_a")).toBe(100n);
  });

  it("opposite-order postings on the same two accounts do not deadlock; everything sums to zero", async () => {
    const a = { kind: "available", ownerId: "wal_x" } as const;
    const b = { kind: "available", ownerId: "wal_y" } as const;
    await sql.begin((tx) =>
      post(tx, "test", "seed", "s", [
        { account: ext, deltaMicros: -200n },
        { account: a, deltaMicros: 100n },
        { account: b, deltaMicros: 100n },
      ]),
    );
    const runs: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      runs.push(
        sql.begin((tx) =>
          post(tx, "test", "t", `ab${i}`, [
            { account: a, deltaMicros: -1n },
            { account: b, deltaMicros: 1n },
          ]),
        ),
        sql.begin((tx) =>
          post(tx, "test", "t", `ba${i}`, [
            { account: b, deltaMicros: -1n },
            { account: a, deltaMicros: 1n },
          ]),
        ),
      );
    }
    await Promise.all(runs);
    expect(await bal("available", "wal_x")).toBe(100n);
    expect(await bal("available", "wal_y")).toBe(100n);
    const [{ s }] = await sql`select coalesce(sum(delta_micros), 0)::bigint as s from entries`;
    expect(s).toBe(0n);
    const [{ s: s2 }] = await sql`select coalesce(sum(balance_micros), 0)::bigint as s from ledger_accounts`;
    expect(s2).toBe(0n);
  });
});
