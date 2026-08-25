"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction } from "@/actions/settings";
import { initialSettingsState } from "@/actions/settings-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-rules";

/**
 * Changes the app password.
 *
 * There is no recovery path — a single hashed password with no email attached
 * is the whole security model — so the form says so plainly rather than
 * letting anyone discover it the hard way.
 */
export function PasswordChange() {
  const [state, formAction] = useActionState(changePasswordAction, initialSettingsState);
  const id = useId();

  // Remounting on success clears the three password fields without an effect
  // and without controlled inputs — React discards the old DOM nodes and their
  // values with them. On failure the key is unchanged, so what was typed
  // survives for correction.
  const formKey = state.status === "saved" ? "saved" : "editing";

  return (
    // formAction is passed straight through: wrapping it in another async
    // function detaches it from useActionState, and the returned state then
    // never updates — the form silently succeeds or fails with no message.
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <div className="field">
        <label className="field-label" htmlFor={`${id}-current`}>
          Current password
        </label>
        <input
          id={`${id}-current`}
          name="currentPassword"
          type="password"
          className="field-input"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-new`}>
          New password
        </label>
        <input
          id={`${id}-new`}
          name="newPassword"
          type="password"
          className="field-input"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="field-help">
          At least {MIN_PASSWORD_LENGTH} characters. There&apos;s no reset — if you
          forget it, the data is unreachable.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-confirm`}>
          Confirm new password
        </label>
        <input
          id={`${id}-confirm`}
          name="confirmPassword"
          type="password"
          className="field-input"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "alert alert-danger" : "alert alert-success"}
        >
          <span aria-hidden="true" className="alert-icon">
            {state.status === "error" ? "⚠" : "✓"}
          </span>
          <span>{state.message}</span>
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div>
      <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
        {pending ? "Changing…" : "Change password"}
      </button>
    </div>
  );
}
