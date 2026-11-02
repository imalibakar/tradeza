import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { BusinessForm } from "@/components/business-form"
import { PayToList } from "@/components/pay-to-list"
import { PaymentPending } from "@/components/payment-pending"
import { getCategories } from "@/lib/queries"
import { confirmListingPayment } from "@/lib/payments"

export const metadata: Metadata = {
  title: "List Your Business — Tradeza",
  description: "Create a business profile and help the right people find you.",
}

export const instant = false

const FAILED_STATUSES = ["failed", "cancelled", "expired"]

export default async function ListBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{
    payment?: string
    payment_id?: string
    status?: string
  }>
}) {
  await connection()
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const query = new URLSearchParams({ payment: "success" })
    if (params.payment_id) query.set("payment_id", params.payment_id)
    if (params.status) query.set("status", params.status)
    const next =
      params.payment === "success"
        ? `/list-business?${query.toString()}`
        : "/list-business"
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_paid_listing, paid_at")
    .eq("id", user.id)
    .maybeSingle()

  let hasPaid = profile?.has_paid_listing === true

  // Dodo appends payment_id/status to the return_url. Verify it server-side so
  // the listing unlocks immediately, even if the webhook has not arrived yet.
  if (!hasPaid && params.payment === "success" && params.payment_id) {
    hasPaid = await confirmListingPayment(supabase, user, params.payment_id)
  }

  const paymentFailed = FAILED_STATUSES.includes(params.status ?? "")
  const paymentPending =
    !hasPaid &&
    params.payment === "success" &&
    !paymentFailed &&
    Boolean(params.payment_id)

  const categories = await getCategories()

  return (
    <section className="py-12 md:py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-10">
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-[#202923] font-bold tracking-tight">
            List your business
          </h1>
          <p className="font-body-md text-body-md text-[#66716A] mt-1">
            Create a profile so other businesses can find you.
          </p>
        </div>
        {hasPaid ? (
          <>
            {params.payment === "success" && (
              <div className="mb-6 bg-[#EDF3ED] text-[#236B50] font-body-sm text-body-sm rounded-xl px-4 py-3 border border-[#CCD5CB]">
                Payment successful — your listing is unlocked. Add your
                business below.
              </div>
            )}
            <div className="bg-surface-container-lowest border border-[#E4E9E3] rounded-2xl p-8 custom-card-shadow">
              <BusinessForm categories={categories} />
            </div>
          </>
        ) : paymentPending ? (
          <PaymentPending />
        ) : (
          <>
            {paymentFailed && (
              <div className="mb-6 bg-error-container text-on-error-container font-body-sm text-body-sm rounded-xl px-4 py-3 border border-[#FFDAD6]">
                Payment was not completed. Please try again.
              </div>
            )}
            <PayToList />
          </>
        )}
      </div>
    </section>
  )
}
