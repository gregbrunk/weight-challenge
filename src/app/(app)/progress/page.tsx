import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PhotoTimeline, type TimelineDay } from "@/components/photo-timeline";
import { daysBetween } from "@/lib/date";
import { getPhotosForPlan } from "@/lib/photos";
import { getActivePlan, toPlanInput } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Progress · Weight Challenge",
};

export default async function ProgressPage() {
  const plan = await getActivePlan();
  if (!plan) redirect("/plan/new");

  const planInput = toPlanInput(plan);
  const photos = await getPhotosForPlan(plan.id);

  // Group by date, keeping the front/side/back order the query already applied.
  const byDate = new Map<string, TimelineDay>();
  for (const photo of photos) {
    const existing = byDate.get(photo.date);
    if (existing) {
      existing.photos.push(photo);
    } else {
      byDate.set(photo.date, {
        date: photo.date,
        dayNumber: daysBetween(planInput.startDate, photo.date) + 1,
        photos: [photo],
      });
    }
  }
  const days = [...byDate.values()];

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">{plan.name}</p>
        <h1 className="page-title">Progress</h1>
      </header>

      <section aria-labelledby="photos-heading" style={{ marginBottom: "var(--space-2xl)" }}>
        <h2
          id="photos-heading"
          className="page-title"
          style={{ fontSize: "var(--text-h3)" }}
        >
          Photo timeline
        </h2>
        <p className="page-subtitle" style={{ marginBottom: "var(--space-lg)" }}>
          {days.length === 0
            ? "Nothing here yet."
            : `${photos.length} photo${photos.length === 1 ? "" : "s"} across ${days.length} day${days.length === 1 ? "" : "s"}. Scroll sideways, tap any photo to open it.`}
        </p>

        {days.length === 0 ? (
          <div className="card">
            <p className="text-muted" style={{ marginBottom: "var(--space-md)" }}>
              Progress photos you add on the Log screen collect here, so you can
              scroll back through the plan and compare.
            </p>
            <Link href="/log" className="btn btn-secondary btn-sm">
              Go to the log
            </Link>
          </div>
        ) : (
          <PhotoTimeline days={days} />
        )}
      </section>

      <section aria-labelledby="charts-heading">
        <h2
          id="charts-heading"
          className="page-title"
          style={{ fontSize: "var(--text-h3)" }}
        >
          Charts and totals
        </h2>
        <p className="page-subtitle" style={{ marginBottom: "var(--space-lg)" }}>
          Coming next.
        </p>

        <div className="card">
          <p className="text-muted">
            The deficit burndown, weight, body fat, VO2 max and blood pressure
            charts, and the current-versus-best statistics all land here in the
            next phase.
          </p>
        </div>
      </section>
    </>
  );
}
