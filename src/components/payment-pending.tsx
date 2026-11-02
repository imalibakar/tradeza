"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@/components/icon"

const MAX_ATTEMPTS = 20

export function PaymentPending() {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return

    const timer = window.setTimeout(() => {
      setAttempts((count) => count + 1)
      router.refresh()
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [attempts, router])

  return (
    <div className="bg-surface-container-lowest border border-[#E4E9E3] rounded-2xl p-8 custom-card-shadow max-w-2xl mx-auto text-center">
      <div className="w-14 h-14 bg-[#EDF3ED] text-primary rounded-2xl mx-auto flex items-center justify-center mb-6">
        <Icon name="hourglass_top" className="text-[30px]" />
      </div>
      <h2 className="font-headline-md text-headline-md text-[#202923] font-bold tracking-tight mb-2">
        Confirming your payment
      </h2>
      <p className="font-body-md text-body-md text-[#66716A] max-w-md mx-auto">
        {attempts >= MAX_ATTEMPTS
          ? "This is taking longer than usual. Refresh the page in a minute — your payment is safe."
          : "Payment received. We are unlocking your business listing — this page will update automatically."}
      </p>
      {attempts >= MAX_ATTEMPTS && (
        <button
          onClick={() => window.location.reload()}
          className="mt-6 bg-primary-container hover:bg-[#1C573F] text-on-primary font-label-lg text-label-lg px-6 py-3 rounded-xl transition-all"
        >
          Refresh page
        </button>
      )}
    </div>
  )
}
