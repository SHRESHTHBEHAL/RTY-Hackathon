try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* no .env: use defaults */
}
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://gaitway:gaitway@localhost:5432/gaitway_test";
