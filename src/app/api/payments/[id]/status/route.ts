import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { payments, users } from "@/db/schema/nowpayments";
import { SESSION_COOKIE } from "@/features/auth/constants";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sessionEmail = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionEmail) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const [account] = await db.select().from(users).where(eq(users.email, sessionEmail)).limit(1);
  if (!account || account.id !== payment.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: payment.id,
    status: payment.status,
    payUrl: payment.payUrl,
    nowpaymentsInvoiceId: payment.nowpaymentsInvoiceId,
    amount: payment.amount,
    currency: payment.currency,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
  });
}
