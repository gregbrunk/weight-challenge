import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { getActivePlan } from "@/lib/plans";

/**
 * The entry point routes rather than renders.
 *
 * With no active plan there is nothing to show, so setup comes first. Once a
 * plan exists, Today is the screen you want on opening the app.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAuth();

  const plan = await getActivePlan();
  redirect(plan ? "/today" : "/plan/new");
}
