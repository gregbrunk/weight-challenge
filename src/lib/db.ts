/**
 * The Prisma client singleton.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 * We use the node-postgres adapter against Neon's pooled connection string,
 * which is what serverless functions need — each invocation gets a connection
 * from the pooler instead of opening its own.
 *
 * The globalThis cache keeps `next dev` from opening a new pool on every hot
 * reload; in production the module is instantiated once per function instance.
 */

// Importing this from a client component is a build error, not a runtime
// one — which is the point. Three separate bugs in this project were a
// client component pulling a server module in through a shared constant.
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in your Neon connection string.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
