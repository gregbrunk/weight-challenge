import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 no longer reads .env on its own, and the connection URL has moved
 * out of schema.prisma. Migration and introspection commands read it from here;
 * the runtime client gets it through a driver adapter in src/lib/db.ts instead.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations run over Neon's DIRECT host, not the pooler: schema changes
    // need a real session, and a transaction pooler can't provide one.
    url: env("DIRECT_URL"),
  },
});
