import type { Metadata } from "next";
import { PasswordChange } from "@/components/password-change";
import { ThemePicker } from "@/components/theme-picker";
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

      <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
        <Section
          id="timezone"
          title="Timezone"
          description={
            <>
              Decides what counts as &ldquo;today&rdquo; everywhere in the app. It
              applies app-wide rather than following whichever device you&apos;re on,
              so opening the app while travelling still logs against the day at home.
            </>
          }
        >
          <TimezonePicker current={current} allZones={allTimeZones()} />
        </Section>

        <Section
          id="appearance"
          title="Appearance"
          description={
            <>
              Light or dark, or whatever the device is already set to. This one is
              per-device rather than app-wide — the phone on the nightstand and the
              laptop don&apos;t want the same answer.
            </>
          }
        >
          <ThemePicker />
        </Section>

        <Section
          id="password"
          title="Password"
          description="Changing it signs out every other device immediately."
        >
          <PasswordChange />
        </Section>

        <Section
          id="export"
          title="Export"
          description={
            <>
              Every plan and every logged day as a CSV, archived plans included,
              with the deficit columns alongside the measurements — the same shape
              as the spreadsheet this replaced.
            </>
          }
        >
          {/* A plain link, not fetch-and-blob: the browser handles the download
              and the filename comes from the server's Content-Disposition. */}
          <a href="/api/export" className="btn btn-secondary" download>
            Download CSV
          </a>
        </Section>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card" aria-labelledby={`${id}-heading`}>
      <h2
        id={`${id}-heading`}
        style={{
          fontSize: "var(--text-title-lg)",
          fontWeight: "var(--weight-bold)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {title}
      </h2>
      <p
        className="text-muted"
        style={{ fontSize: "var(--text-body-md)", marginBottom: "var(--space-lg)" }}
      >
        {description}
      </p>
      {children}
    </section>
  );
}
