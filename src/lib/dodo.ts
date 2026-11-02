import { env } from "@/lib/env"

export function getDodoApiBase() {
  return process.env.NEXT_PUBLIC_PAYMENT_MODE === "live"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com"
}

export type DodoPayment = {
  payment_id?: string
  status?: string | null
  total_amount?: number | null
  currency?: string | null
  metadata?: Record<string, unknown> | null
  customer?: {
    email?: string | null
    name?: string | null
  } | null
}

export async function fetchDodoPayment(
  paymentId: string
): Promise<DodoPayment | null> {
  const apiKey = env.DODO_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `${getDodoApiBase()}/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }
    )

    if (!res.ok) return null
    return (await res.json()) as DodoPayment
  } catch (error) {
    console.error("Dodo payment lookup failed", error)
    return null
  }
}
