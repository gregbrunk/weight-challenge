/**
 * Database health check.
 *
 * Exercises the exact path the app uses at runtime — the pooled Neon host
 * through the node-postgres driver adapter — and reports what's in the
 * database. Run with `npm run db:check` when a connection looks wrong.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const host = new URL(url).host;
console.log(`Connecting to ${host}`);
if (!host.includes("-pooler")) {
  console.warn(
    "  Warning: this is not the pooled host. Serverless functions should use the -pooler URL.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const [{ version }] = await prisma.$queryRaw`SELECT version()`;
  console.log(`  ${version.split(",")[0]}`);

  // Ensures the settings singleton exists; harmless to run repeatedly.
  const setting = await prisma.setting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  const [plans, activePlan, entries, photos] = await Promise.all([
    prisma.plan.count(),
    prisma.plan.findFirst({ where: { status: "active" } }),
    prisma.dailyEntry.count(),
    prisma.photo.count(),
  ]);

  console.log("\nState");
  console.log(`  password set:  ${setting.passwordHash !== null}`);
  console.log(`  session epoch: ${setting.sessionEpoch}`);
  console.log(`  plans:         ${plans}${activePlan ? ` (active: ${activePlan.name})` : ""}`);
  console.log(`  daily entries: ${entries}`);
  console.log(`  photos:        ${photos}`);
  console.log("\nOK");
} catch (error) {
  console.error("\nFailed:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
