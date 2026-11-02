import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { getDodoApiBase } from "@/lib/dodo"

/**
 * Build the URL the user is actually browsing on. Using NEXT_PUBLIC_SITE_URL
 * alone is fragile because it is often left as http://localhost:3000 in
 * production, which leaves customers stranded after checkout.
 */
function resolveBaseUrl(request: Request) {
  const origin = request.headers.get("origin")
  if (origin) return origin.replace(/\/$/, "")

  const forwardedHost = request.headers.get("x-forwarded-host")
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https"
    return `${proto}://${forwardedHost}`
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
  if (siteUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(siteUrl)) {
    return siteUrl
  }

  return new URL(request.url).origin
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Please log in to continue" }, { status: 401 })
  }

  try {
    const productId = env.DODO_PRODUCT_ID
    const apiKey = env.DODO_API_KEY

    if (!productId || !apiKey) {
      console.error("Missing Dodo env:", { hasProduct: !!productId, hasKey: !!apiKey })
      return NextResponse.json(
        { error: "Payment not configured. Please contact support." },
        { status: 500 }
      )
    }

    const baseUrl = resolveBaseUrl(request)

    const res = await fetch(`${getDodoApiBase()}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_cart: [
          {
            product_id: productId,
            quantity: 1,
          },
        ],
        return_url: `${baseUrl}/list-business?payment=success`,
        feature_flags: {
          redirect_immediately: true,
        },
        metadata: {
          user_id: user.id,
          email: user.email || "",
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message || "Failed to create checkout" },
        { status: 500 }
      )
    }

    if (data?.checkout_url) {
      return NextResponse.json({ url: data.checkout_url })
    }

    if (data?.url) {
      return NextResponse.json({ url: data.url })
    }

    return NextResponse.json(
      { error: "No checkout URL returned" },
      { status: 500 }
    )
  } catch (e) {
    console.error("checkout error", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Something went wrong" },
      { status: 500 }
    )
  }
}
