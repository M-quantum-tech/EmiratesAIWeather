import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages, context }: { messages: UIMessage[]; context?: string } = await req.json()

  const result = streamText({
    model: "openai/gpt-4.1-mini",
    instructions: [
      "You are EmiratesAIWeather's friendly assistant — a helpful weather and wellness companion.",
      "Help users understand the current conditions, forecast, air quality, and the four-level alert model (green SAFE, yellow, orange, red).",
      "You can also offer light, encouraging wellness, hydration, and sun-safety guidance when relevant.",
      "Be concise, warm, and practical. Use short paragraphs or bullet points. Never invent precise numbers you were not given — if you lack data, say so and suggest checking the live dashboard.",
      context ? `Live weather context for the user's current location:\n${context}` : "No live weather context is available right now.",
    ].join("\n\n"),
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.log("[v0] chat stream error:", message)
      if (message.includes("credit card") || message.includes("customer_verification")) {
        return "The AI assistant isn't activated yet. The workspace owner needs to add a payment card to the Vercel AI Gateway to unlock free credits."
      }
      return "Sorry, I couldn't reach the AI service just now. Please try again in a moment."
    },
  })
}
