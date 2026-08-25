import { requireAuth } from "@/lib/auth/server";
import { AppNav } from "@/components/app-nav";

/**
 * The authenticated shell.
 *
 * Every route inside this group is gated here, so no individual page can
 * forget. Middleware has already checked the token's signature; this call adds
 * the epoch check that only the server can make.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAuth();

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <AppNav />

      <main id="main" className="page app-main">
        {children}
      </main>
    </div>
  );
}
