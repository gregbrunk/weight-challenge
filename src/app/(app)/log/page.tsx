import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActivePlan } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Log · Weight Challenge",
};

export default async function LogPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Log</h1>
      </header>

      <div className="card">
        <p className="text-muted">Daily entry lands here in the next phase — weight and body fat in the morning, calories and blood pressure at night, each saving on its own so you can come back through the day.</p>
      </div>
    </>
  );
}
