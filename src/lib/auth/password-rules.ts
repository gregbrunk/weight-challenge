/**
 * Password rules that both sides need.
 *
 * Deliberately free of `node:crypto`: the change-password form is a client
 * component and needs the minimum length for its own `minLength` attribute.
 * Importing that constant from `password.ts` pulls scrypt into the browser
 * bundle, where `node:crypto` resolves to nothing and `promisify(undefined)`
 * throws on module evaluation — taking the whole Settings page down.
 */

export const MIN_PASSWORD_LENGTH = 8;

export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
