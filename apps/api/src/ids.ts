import { randomInt } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomBase36(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(36)];
  return out;
}

/** `prefix_` followed by 24 lowercase base-36 characters (context.md section 6). */
export function newId(prefix: string): string {
  return `${prefix}_${randomBase36(24)}`;
}
