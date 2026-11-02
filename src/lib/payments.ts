import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"
import { fetchDodoPayment } from "@/lib/dodo"
import type { Database, Json } from "@/lib/types/database"

const LISTING_PRICE = 49

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

/**
 * Confirms a Dodo payment for the current user and unlocks business listings.
 *
 * The return_url is only a UI hint, so we always re-check the payment with
 * Dodo's API before granting access. This also covers the case where the
 * webhook is delayed or not configured yet.
 */
export async function confirmListingPayment(
  supabase: SupabaseClient<Database>,
  user: { id: string; email?: string | null },
  paymentId: string
): Promise<boolean> {
  const payment = await fetchDodoPayment(paymentId)
  if (!payment || payment.status !== "succeeded") return false

  const ownerId =
    typeof payment.metadata?.user_id === "string"
      ? payment.metadata.user_id
      : null
  const payerEmail = payment.customer?.email?.toLowerCase() ?? null
  const userEmail = user.email?.toLowerCase() ?? null

  const belongsToUser = ownerId
    ? ownerId === user.id
    : Boolean(payerEmail && userEmail && payerEmail === userEmail)

  if (!belongsToUser) return false

  const now = new Date().toISOString()
  const db = createAdminClient() ?? supabase

  const { error: profileError } = await db
    .from("profiles")
    .update({
      has_paid_listing: true,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", user.id)

  // The payment itself is verified, so let the customer through even if this
  // bookkeeping write fails. Creating a business does not depend on the flag.
  if (profileError) {
    console.error("Failed to unlock listing after payment", profileError)
  }

  const { error: paymentError } = await db.from("payments").upsert(
    {
      user_id: user.id,
      dodo_payment_id: payment.payment_id ?? paymentId,
      dodo_checkout_id: null,
      product_id: env.DODO_PRODUCT_ID ?? null,
      amount: LISTING_PRICE,
      currency: payment.currency ?? "INR",
      status: "succeeded",
      metadata: payment as unknown as Json,
    },
    { onConflict: "dodo_payment_id" }
  )

  // The listing is already unlocked, so a bookkeeping failure is not fatal.
  if (paymentError) {
    console.error("Failed to record payment", paymentError)
  }

  return true
}
