/**
 * Wipes the database back to first-run state: no plans, no entries, no photos,
 * no password. Requires --yes so it can't be run by accident.
 *
 *   npm run db:reset -- --yes
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

if (!process.argv.includes("--yes")) {
  console.error("This deletes every plan, entry and photo, and clears the password.");
  console.error("Re-run with --yes if that's what you want:\n");
  console.error("  npm run db:reset -- --yes\n");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  // Photos and entries cascade from Plan, but delete explicitly so the counts
  // reported below are honest.
  const photos = await prisma.photo.deleteMany();
  const entries = await prisma.dailyEntry.deleteMany();
  const plans = await prisma.plan.deleteMany();

  await prisma.setting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    // Bumping the epoch invalidates any session still holding a cookie.
    update: { passwordHash: null, sessionEpoch: { increment: 1 } },
  });

  console.log(
    `Deleted ${plans.count} plan(s), ${entries.count} entr(ies), ${photos.count} photo(s).`,
  );
  console.log("Password cleared. The next visit will ask you to set one.");
} finally {
  await prisma.$disconnect();
}
