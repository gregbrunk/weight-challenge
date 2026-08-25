"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/server";
import { setTimeZone } from "@/lib/settings";
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
