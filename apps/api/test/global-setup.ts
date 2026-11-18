import postgres from "postgres";
import { migrate } from "../src/db/migrate.js";
import { createSql } from "../src/db/client.js";
import { TEST_DATABASE_URL } from "./env.js";

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length === 0) await admin.unsafe(`create database "${dbName}"`);
  await admin.end();
  const sql = createSql(TEST_DATABASE_URL, { max: 1 });
  await migrate(sql);
  await sql.end();
}
