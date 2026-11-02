import DodoPayments from "dodopayments"
import { createClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"
import type { Database, Json } from "@/lib/types/database"

const LISTING_PRICE = 49

type DodoWebhookPayload = {
  type?: string
  data?: {
    payment_id?: string
    status?: string | null
    checkout_session_id?: string | null
    total_amount?: number | null
    currency?: string | null
    metadata?: Record<string, unknown> | null
    customer?: { email?: string | null } | null
  }
}

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

function readEvent(request: Request, body: string): DodoWebhookPayload | null {
  const secret = env.DODO_WEBHOOK_SECRET

  if (secret) {
    const client = new DodoPayments({
      bearerToken: env.DODO_API_KEY ?? "",
      webhookKey: secret,
    })

    return client.webhooks.unwrap(body, {
      headers: {
        "webhook-id": request.headers.get("webhook-id") ?? "",
        "webhook-signature": request.headers.get("webhook-signature") ?? "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      },
    }) as DodoWebhookPayload
  }

  // Never accept unsigned webhooks in live mode.
  if (process.env.NEXT_PUBLIC_PAYMENT_MODE === "live") return null

  return JSON.parse(body) as DodoWebhookPayload
}

export async function handleDodoWebhook(request: Request) {
  let event: DodoWebhookPayload | null = null

  try {
    const body = await request.text()
    event = readEvent(request, body)
  } catch (error) {
    console.error("Invalid Dodo webhook", error)
    return Response.json({ error: "Invalid signature" }, { status: 401 })
  }

  if (!event) {
    console.error("Dodo webhook rejected: missing or invalid configuration")
    return Response.json({ error: "Webhook not configured" }, { status: 500 })
  }

  if (event.type !== "payment.succeeded") {
    return Response.json({ received: true })
  }

  const data = event.data ?? {}
  const userId =
    typeof data.metadata?.user_id === "string" ? data.metadata.user_id : null
  const paymentId = data.payment_id ?? null

  if (!userId || !paymentId) {
    console.error("Dodo webhook missing user_id/payment_id", {
      hasUserId: Boolean(userId),
      hasPaymentId: Boolean(paymentId),
    })
    return Response.json({ received: true })
  }

  const db = createAdminClient()
  if (!db) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY is missing; cannot fulfil Dodo payment",
      { paymentId }
    )
    return Response.json({ received: true })
  }

  const now = new Date().toISOString()

  const { error: paymentError } = await db.from("payments").upsert(
    {
      user_id: userId,
      dodo_payment_id: paymentId,
      dodo_checkout_id: data.checkout_session_id ?? null,
      product_id: env.DODO_PRODUCT_ID ?? null,
      amount: LISTING_PRICE,
      currency: data.currency ?? "INR",
      status: "succeeded",
      metadata: event as unknown as Json,
    },
    { onConflict: "dodo_payment_id" }
  )

  if (paymentError) {
    console.error("Failed to record Dodo payment", paymentError)
  }

  const { error: profileError } = await db
    .from("profiles")
    .update({
      has_paid_listing: true,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", userId)

  if (profileError) {
    console.error("Failed to unlock listing from Dodo webhook", profileError)
  }

  return Response.json({ received: true })
}
