import { handleDodoWebhook } from "@/lib/dodo-webhook"

export async function POST(request: Request) {
  return handleDodoWebhook(request)
}
