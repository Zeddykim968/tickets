"use server";

import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { events, orders } from "@/db/schema";
import { getAdminSession } from "@/lib/admin/auth";

const fixtureStatusSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["scheduled", "on_sale", "sold_out", "cancelled", "completed"]),
});

export async function updateFixtureStatusAction(formData: FormData) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const parsed = fixtureStatusSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect("/admin?error=invalid_fixture");
  }

  const db = getDb();
  if (parsed.data.status === "cancelled") {
    const [paidOrderCount] = await db
      .select({ value: count() })
      .from(orders)
      .where(and(eq(orders.eventId, parsed.data.eventId), eq(orders.status, "paid")));
    if ((paidOrderCount?.value ?? 0) > 0) {
      redirect("/admin?error=paid_orders");
    }
  }

  const [updated] = await db
    .update(events)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(events.id, parsed.data.eventId))
    .returning({ id: events.id });

  if (!updated) {
    redirect("/admin?error=fixture_not_found");
  }

  console.info("[admin] fixture status updated", {
    actor: session.email,
    eventId: updated.id,
    status: parsed.data.status,
  });
  redirect("/admin?updated=1");
}
