/**
 * Password hashing.
 *
 * Uses Node's built-in scrypt rather than a native argon2 binding: this is a
 * single-user app with one password, scrypt is memory-hard and in the standard
 * library, and it deploys to any runtime without a compiled dependency.
 *
 * Node runtime only — the Web Crypto available to Edge middleware has no scrypt.
 * Middleware verifies session tokens instead, and never touches the password.
 */

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import "server-only";

// Re-exported so server code has one import. Client components must import
// from "./password-rules" directly — this module reaches node:crypto.
export { MIN_PASSWORD_LENGTH, describePasswordProblem } from "./password-rules";

// promisify() collapses to the 3-argument overload and drops the options
// parameter, so the signature is restated here.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Deliberately costly. ~100ms per attempt on modern hardware. */
const COST = { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 2 ** 16 * 8 * 2 };
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const FORMAT = "scrypt";

/** Produces `scrypt:N:r:p:salt:key`, all parameters recoverable for verification. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_BYTES, COST);

  return [
    FORMAT,
    COST.N,
    COST.r,
    COST.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(":");
}

/**
 * Constant-time verification. Returns false for malformed hashes rather than
 * throwing, so a corrupted settings row locks the app rather than crashing it.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== FORMAT) return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const N = Number(n);
  const rNum = Number(r);
  const pNum = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(rNum) || !Number.isInteger(pNum)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(keyB64, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r: rNum,
      p: pNum,
      maxmem: 128 * N * rNum * 2,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
