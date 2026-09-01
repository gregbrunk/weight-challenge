"use server";

import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth/server";
import { describePasswordProblem } from "@/lib/auth/password";
import { checkPassword, isPasswordSet, setInitialPassword } from "@/lib/settings";
import {
  checkUnlockThrottle,
  clearUnlockFailures,
  clientKey,
  pruneUnlockAttempts,
  recordUnlockFailure,
} from "@/lib/auth/rate-limit";
import { describeWait } from "@/lib/auth/rate-limit-policy";
import type { UnlockState } from "./state";


/** Only ever return to a path on this site. */
function safeDestination(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * First run: choose the password.
 *
 * Guarded by `setInitialPassword`, which refuses when one already exists, so
 * this cannot be replayed to seize an app that is already locked.
 */
export async function createPasswordAction(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = describePasswordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  if (!(await setInitialPassword(password))) {
    return { error: "A password is already set. Reload the page and enter it." };
  }

  await startSession();
  redirect(safeDestination(formData.get("next")));
}

/**
 * Returning: enter the password.
 *
 * Brute force is held off by a per-client lockout that grows with each wrong
 * answer, backed by a row in the database. scrypt's ~100ms cost is still there
 * and still helps, but on its own it only slows one attacker making one guess
 * at a time — fifty parallel requests is about 500 guesses a second.
 *
 * The throttle is checked *before* the password is verified, so a locked-out
 * caller never reaches the hash at all. That keeps the expensive work off the
 * path an attacker controls, which is the other half of the point.
 */
export async function unlockAction(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");
  const key = await clientKey();

  const throttle = await checkUnlockThrottle(key);
  if (!throttle.allowed) {
    return { error: `Too many attempts. Try again ${describeWait(throttle.retryAfterSeconds)}.` };
  }

  if (password === "") return { error: "Enter your password." };

  if (!(await isPasswordSet())) {
    return { error: "No password is set yet. Reload the page to create one." };
  }

  if (!(await checkPassword(password))) {
    const next = await recordUnlockFailure(key);

    // One message whether the guess was close or nowhere near, and it names a
    // wait only once the door is actually shut.
    return {
      error: next.allowed
        ? "That password isn't right."
        : `That password isn't right. Too many attempts — try again ${describeWait(next.retryAfterSeconds)}.`,
    };
  }

  await clearUnlockFailures(key);
  await pruneUnlockAttempts();

  await startSession();
  redirect(safeDestination(formData.get("next")));
}
