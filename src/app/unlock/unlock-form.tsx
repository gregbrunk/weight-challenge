"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createPasswordAction, unlockAction } from "./actions";
import { initialUnlockState } from "./state";

interface Props {
  /** "create" on first run, "enter" every time after. */
  mode: "create" | "enter";
  next: string;
}

export function UnlockForm({ mode, next }: Props) {
  const action = mode === "create" ? createPasswordAction : unlockAction;
  const [state, formAction] = useActionState(action, initialUnlockState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="field">
        <label className="field-label" htmlFor="password">
          {mode === "create" ? "Choose a password" : "Password"}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field-input"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          // The whole point of this screen is to type the password, so focus it.
          autoFocus
          required
          aria-invalid={state.error !== null}
          aria-describedby={state.error ? "unlock-error" : "password-help"}
        />
        {mode === "create" && !state.error && (
          <p id="password-help" className="field-help">
            At least 8 characters. You&apos;ll need it again after 15 minutes of
            inactivity.
          </p>
        )}
      </div>

      {mode === "create" && (
        <div className="field">
          <label className="field-label" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            className="field-input"
            autoComplete="new-password"
            required
          />
        </div>
      )}

      {state.error && (
        <p id="unlock-error" role="alert" className="alert alert-danger">
          <span aria-hidden="true" className="alert-icon">
            ⚠
          </span>
          <span>{state.error}</span>
        </p>
      )}

      <SubmitButton mode={mode} />
    </form>
  );
}

function SubmitButton({ mode }: { mode: "create" | "enter" }) {
  const { pending } = useFormStatus();
  const label = mode === "create" ? "Set password" : "Unlock";

  return (
    <button
      type="submit"
      className="btn btn-primary btn-block"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? `${label}…` : label}
    </button>
  );
}
