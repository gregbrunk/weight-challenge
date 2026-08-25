import type { Metadata } from "next";
import { TimezonePicker } from "@/components/timezone-picker";
import { getSettings } from "@/lib/settings";
import { allTimeZones, DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/timezone";

export const metadata: Metadata = {
  title: "Settings · Weight Challenge",
};

export default async function SettingsPage() {
  const settings = await getSettings();
  const current = isValidTimeZone(settings.timeZone)
    ? settings.timeZone
    : DEFAULT_TIME_ZONE;

  return (
    <>
      <header style={{ marginBottom: "var(--space-xl)" }}>
        <p className="label-caps">App</p>
        <h1 className="page-title">Settings</h1>
      </header>

      <section className="card" aria-labelledby="timezone-heading">
        <h2
          id="timezone-heading"
          style={{
            fontSize: "var(--text-h4)",
            fontWeight: "var(--weight-bold)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          Timezone
        </h2>
        <p
          className="text-muted"
          style={{ fontSize: "var(--text-body-sm)", marginBottom: "var(--space-lg)" }}
        >
          Decides what counts as &ldquo;today&rdquo; everywhere in the app. It applies
          app-wide rather than following whichever device you&apos;re on, so opening
          the app while travelling still logs against the day at home.
        </p>

        <TimezonePicker current={current} allZones={allTimeZones()} />
      </section>
    </>
  );
}
