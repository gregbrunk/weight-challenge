import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActivePlan } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Today · Weight Challenge",
};

export default async function TodayPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Today</h1>
      </header>

      <div className="card">
        <p className="text-muted">Your daily snapshot lands here in the next phase: whether you hit your calorie goals, how far above or below the target deficit you were, and today&apos;s weight, body fat, VO2 max and blood pressure.</p>
      </div>
    </>
  );
}
