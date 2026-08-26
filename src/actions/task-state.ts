/**
 * Form state for the task editor. Kept out of the actions module because a
 * "use server" file may only export async functions.
 */

export interface TaskFormState {
  status: "idle" | "saved" | "error";
  message: string | null;
}

export const initialTaskFormState: TaskFormState = { status: "idle", message: null };
