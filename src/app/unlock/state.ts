/**
 * Form state for the unlock screen. Separate from the actions module because a
 * "use server" file may only export async functions.
 */

export interface UnlockState {
  error: string | null;
}

export const initialUnlockState: UnlockState = { error: null };
