/**
 * Downloads every plan and every logged day as CSV.
 *
 * Behind the session like everything else — this is the most complete copy of
 * the data that exists, so it is the last thing that should be reachable
 * without the password.
 */

import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth/server";
import { buildCsv, exportFilename, type ExportPlan } from "@/lib/csv";
import { getEntryInputs, listPlans, toPlanInput } from "@/lib/plans";
import { getToday } from "@/lib/timezone-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasValidSession())) {
    return new NextResponse(null, { status: 404 });
  }

  const plans = await listPlans();

  const exported: ExportPlan[] = await Promise.all(
    plans.map(async (plan) => ({
      name: plan.name,
      status: plan.status,
      plan: toPlanInput(plan),
      entries: await getEntryInputs(plan.id),
    })),
  );

  const csv = buildCsv(exported);
  const filename = exportFilename(await getToday());

  return new NextResponse(csv, {
    headers: {
      // The charset matters: without it Excel mis-reads non-ASCII plan names.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
