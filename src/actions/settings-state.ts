/**
 * Form state for the settings screens. Kept out of the actions module because a
 * "use server" file may only export async functions.
 */

export interface SettingsFormState {
  status: "idle" | "saved" | "error";
  message: string | null;
}

export const initialSettingsState: SettingsFormState = {
  status: "idle",
  message: null,
};
