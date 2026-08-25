"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, startSession } from "@/lib/auth/server";
import { describePasswordProblem } from "@/lib/auth/password";
import { changePassword, setTimeZone } from "@/lib/settings";
import type { SettingsFormState } from "./settings-state";

export async function setTimeZoneAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireAuth();

  const timeZone = String(formData.get("timeZone") ?? "");

  if (!(await setTimeZone(timeZone))) {
    return { status: "error", message: "That isn't a timezone this app recognises." };
  }

  // Every dated screen in the app depends on this, so the whole tree is stale.
  revalidatePath("/", "layout");

  return { status: "saved", message: "Timezone updated." };
}

/**
 * Changes the app password.
 *
 * Changing it bumps the session epoch, which invalidates every outstanding
 * session — including this one, and including one left open on a device you no
 * longer have. A fresh session is issued immediately afterwards so the person
 * who just typed the new password isn't the one locked out.
 */
export async function changePasswordAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireAuth();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (current === "") {
    return { status: "error", message: "Enter your current password." };
  }

  const problem = describePasswordProblem(next);
  if (problem) return { status: "error", message: problem };

  if (next !== confirm) {
    return { status: "error", message: "The two new passwords don't match." };
  }
  if (next === current) {
    return { status: "error", message: "That's already your password." };
  }

  if (!(await changePassword(current, next))) {
    return { status: "error", message: "Your current password isn't right." };
  }

  // Re-issue against the new epoch, otherwise the next page load logs us out.
  await startSession();
  revalidatePath("/", "layout");

  return {
    status: "saved",
    message: "Password changed. Any other signed-in device has been logged out.",
  };
}
