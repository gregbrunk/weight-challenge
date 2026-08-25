import { beforeAll, describe, expect, it } from "vitest";
import { describePasswordProblem, hashPassword, verifyPassword } from "./password";
import {
  createSessionToken,
  readSessionToken,
  shouldRefresh,
  SESSION_TTL_SECONDS,
} from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-that-is-comfortably-long-enough-32";
});

describe("password hashing", () => {
  it("round-trips the correct password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse batter", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");

    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("records its parameters so future cost changes stay verifiable", async () => {
    const stored = await hashPassword("whatever");
    const [format, n, r, p] = stored.split(":");

    expect(format).toBe("scrypt");
    expect(Number(n)).toBe(2 ** 16);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("normalises unicode so an accented password survives a keyboard change", async () => {
    // Same string, composed vs decomposed.
    const composed = "café-password";
    const decomposed = "café-password";

    const stored = await hashPassword(composed);
    expect(await verifyPassword(decomposed, stored)).toBe(true);
  });

  it("returns false rather than throwing on a corrupted hash", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt:bad:8:1:aaaa:bbbb",
      "bcrypt:65536:8:1:aaaa:bbbb",
      "scrypt:65536:8:1::",
      "scrypt:65536:8:1:aaaa",
    ]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("enforces a minimum length", () => {
    expect(describePasswordProblem("short")).toMatch(/at least 8/);
    expect(describePasswordProblem("long enough")).toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(1);
    const payload = await readSessionToken(token);

    expect(payload?.epoch).toBe(1);
  });

  it("expires fifteen minutes out", async () => {
    const token = await createSessionToken(1);
    const payload = await readSessionToken(token);

    expect(payload!.exp! - payload!.iat!).toBe(SESSION_TTL_SECONDS);
  });

  it("rejects a missing, malformed or tampered token", async () => {
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken("")).toBeNull();
    expect(await readSessionToken("not.a.jwt")).toBeNull();

    const token = await createSessionToken(1);
    const tampered = token.slice(0, -3) + "aaa";
    expect(await readSessionToken(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(1);

    process.env.SESSION_SECRET = "a-completely-different-secret-also-long-enough";
    expect(await readSessionToken(token)).toBeNull();

    process.env.SESSION_SECRET = "test-secret-that-is-comfortably-long-enough-32";
    expect(await readSessionToken(token)).not.toBeNull();
  });

  it("refuses to sign with a weak or missing secret", async () => {
    const original = process.env.SESSION_SECRET;

    delete process.env.SESSION_SECRET;
    await expect(createSessionToken(1)).rejects.toThrow(/SESSION_SECRET/);

    process.env.SESSION_SECRET = "too-short";
    await expect(createSessionToken(1)).rejects.toThrow(/SESSION_SECRET/);

    process.env.SESSION_SECRET = original;
  });

  it("carries the epoch, so a password change can invalidate old sessions", async () => {
    const token = await createSessionToken(3);
    const payload = await readSessionToken(token);

    // Middleware compares this against Setting.sessionEpoch.
    expect(payload?.epoch).toBe(3);
  });

  it("holds off on refreshing a token that was just issued", async () => {
    const payload = await readSessionToken(await createSessionToken(1));
    expect(shouldRefresh(payload!)).toBe(false);
  });

  it("refreshes once the token is a minute old", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(shouldRefresh({ epoch: 1, iat: now - 61 })).toBe(true);
  });
});
