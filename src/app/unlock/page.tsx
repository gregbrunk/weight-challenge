import type { Metadata } from "next";
import { isPasswordSet } from "@/lib/settings";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = {
  title: "Unlock · Weight Challenge",
};

// The password state lives in the database and changes at runtime, so this
// screen can never be prerendered.
export const dynamic = "force-dynamic";

export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = typeof rawNext === "string" && rawNext.startsWith("/") ? rawNext : "/";

  const passwordSet = await isPasswordSet();
  const mode = passwordSet ? "enter" : "create";

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center"
      style={{
        paddingBlock: "var(--space-2xl)",
        paddingInline: "max(var(--gutter), var(--safe-left))",
      }}
    >
      <div className="w-full" style={{ maxWidth: "400px" }}>
        <div className="card card-raised">
          <p className="label-caps" style={{ marginBottom: "var(--space-xs)" }}>
            {mode === "create" ? "First run" : "Locked"}
          </p>

          <h1
            style={{
              fontSize: "var(--text-headline)",
              fontWeight: "var(--weight-bold)",
              lineHeight: "var(--leading-snug)",
              letterSpacing: "-0.01em",
              marginBottom: "var(--space-xs)",
            }}
          >
            {mode === "create" ? "Set your password" : "Weight Challenge"}
          </h1>

          <p
            className="text-muted"
            style={{
              fontSize: "var(--text-body-md)",
              marginBottom: "var(--space-lg)",
            }}
          >
            {mode === "create"
              ? "This is the only thing standing between your data and anyone who finds the link. Pick something you'll remember — there's no reset."
              : "Enter your password to continue."}
          </p>

          <UnlockForm mode={mode} next={next} />
        </div>
      </div>
    </main>
  );
}
