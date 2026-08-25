/**
 * Form state shared between the plan actions and the plan form.
 *
 * Kept out of the actions module because a "use server" file may only export
 * async functions — a plain constant there is a build error.
 */

export interface PlanFormState {
  errors: Record<string, string>;
  message: string | null;
}

export const initialPlanFormState: PlanFormState = { errors: {}, message: null };
