"use server";

import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth/server";
import { describePasswordProblem } from "@/lib/auth/password";
import { checkPassword, isPasswordSet, setInitialPassword } from "@/lib/settings";
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
 * Brute force is held off by the scrypt cost — roughly 100ms per attempt —
 * rather than by a counter, which wouldn't survive across serverless instances
 * anyway. The eight-character minimum is what makes that arithmetic work.
 */
export async function unlockAction(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");

  if (password === "") return { error: "Enter your password." };

  if (!(await isPasswordSet())) {
    return { error: "No password is set yet. Reload the page to create one." };
  }

  if (!(await checkPassword(password))) {
    return { error: "That password isn't right." };
  }

  await startSession();
  redirect(safeDestination(formData.get("next")));
}
