/**
 * Application settings — a single row holding the password hash and the session
 * epoch. Server-side only.
 */

import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./auth/password";
import { isValidTimeZone } from "./timezone";

const SINGLETON_ID = "singleton";

/** Reads the settings row, creating it on first access. */
export async function getSettings() {
  return prisma.setting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

export async function isPasswordSet(): Promise<boolean> {
  const setting = await getSettings();
  return setting.passwordHash !== null;
}

/**
 * Sets the password for the first time.
 *
 * Refuses if one already exists, so the first-run screen can never be used to
 * take over an app that is already locked.
 */
export async function setInitialPassword(password: string): Promise<boolean> {
  const setting = await getSettings();
  if (setting.passwordHash !== null) return false;

  await prisma.setting.update({
    where: { id: SINGLETON_ID },
    data: { passwordHash: await hashPassword(password) },
  });
  return true;
}

/** Checks a password against the stored hash. False when none is set yet. */
export async function checkPassword(password: string): Promise<boolean> {
  const setting = await getSettings();
  if (setting.passwordHash === null) return false;

  return verifyPassword(password, setting.passwordHash);
}

/**
 * Replaces the password, requiring the current one.
 *
 * Bumps the session epoch, which invalidates every outstanding session
 * including the one that made the change — so a stolen laptop can be locked out
 * from anywhere.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const setting = await getSettings();
  if (setting.passwordHash === null) return false;
  if (!(await verifyPassword(currentPassword, setting.passwordHash))) return false;

  await prisma.setting.update({
    where: { id: SINGLETON_ID },
    data: {
      passwordHash: await hashPassword(newPassword),
      sessionEpoch: { increment: 1 },
    },
  });
  return true;
}

/**
 * Changes the timezone the whole app runs on.
 *
 * Returns false for a zone this runtime doesn't recognise, rather than storing
 * a value that would later throw inside Intl on every page.
 */
export async function setTimeZone(timeZone: string): Promise<boolean> {
  if (!isValidTimeZone(timeZone)) return false;

  await prisma.setting.update({
    where: { id: SINGLETON_ID },
    data: { timeZone },
  });
  return true;
}

export async function getSessionEpoch(): Promise<number> {
  const setting = await getSettings();
  return setting.sessionEpoch;
}
