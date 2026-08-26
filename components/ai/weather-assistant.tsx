"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Bot, Send, Sparkles, X, MessageCircle } from "lucide-react"
import { useWeather } from "@/components/weather/weather-provider"
import {
  buildAlert,
  compass,
  describeCode,
  speedUnit,
  tempUnit,
  toMetersPerSecond,
} from "@/lib/weather"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
  "Is it a good time for a walk?",
  "Explain today's alert level",
  "Will it rain in the next few hours?",
  "What should I wear today?",
]

export function WeatherAssistant() {
  const { payload, units } = useWeather()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const context = useMemo(() => {
    if (!payload) return ""
    const c = payload.current
    const alert = buildAlert(payload)
    const cond = describeCode(c.weatherCode).label
    const speed = units === "metric" ? `${toMetersPerSecond(c.windSpeed).toFixed(1)} m/s` : `${c.windSpeed} ${speedUnit(units)}`
    const gust = units === "metric" ? `${toMetersPerSecond(c.windGusts).toFixed(1)} m/s` : `${c.windGusts} ${speedUnit(units)}`
    return [
      `Location: ${payload.location.name}${payload.location.country ? `, ${payload.location.country}` : ""}`,
      `Condition: ${cond}`,
      `Temperature: ${Math.round(c.temperature)}${tempUnit(units)} (feels like ${Math.round(c.apparentTemperature)}${tempUnit(units)})`,
      `Humidity: ${Math.round(c.humidity)}%`,
      `Wind: ${speed} from the ${compass(c.windDirection)}, gusting ${gust}`,
      `Precipitation now: ${c.precipitation}`,
      `UV index: ${c.uvIndex.toFixed(1)}`,
      payload.air?.aqi != null ? `Air quality (US AQI): ${Math.round(payload.air.aqi)}` : "",
      `Alert level: ${alert.code} ${alert.title} (severity ${alert.score}/100) — ${alert.headline}`,
      `Rain probability next hours: ${payload.hourly.slice(payload.currentHourIndex, payload.currentHourIndex + 6).map((h) => `${Math.round(h.precipitationProbability)}%`).join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n")
  }, [payload, units])

  const contextRef = useRef(context)
  useEffect(() => {
    contextRef.current = context
  }, [context])

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ context: contextRef.current }),
    }),
  })

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, status])

  const busy = status === "submitted" || status === "streaming"

  const submit = (text: string) => {
    if (!text.trim() || busy) return
    sendMessage({ text })
    setInput("")
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105"
        aria-label={open ? "Close weather assistant" : "Open weather assistant"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-20 right-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-all duration-300",
          open ? "pointer-events-auto h-[32rem] opacity-100" : "pointer-events-none h-0 translate-y-4 opacity-0",
        )}
        role="dialog"
        aria-label="AI weather assistant"
      >
        <header className="flex items-center gap-2 border-b border-border bg-accent/10 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">AI weather talk</p>
            <p className="truncate font-mono text-[0.625rem] text-muted-foreground">
              {payload ? `context: ${payload.location.name}` : "connecting…"}
            </p>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                Ask me anything about your local weather, the alert level, or how to plan your day.
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-secondary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>
              </div>
            ))
          )}
          {status === "submitted" ? (
            <div className="flex justify-start">
              <div className="rounded-lg bg-secondary px-3 py-2">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </span>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              <p className="font-semibold">The AI assistant is unavailable right now.</p>
              <p className="mt-1 text-destructive/90">
                If this is a new project, the Vercel AI Gateway may need a payment card on file to
                unlock free credits. Otherwise, please try again in a moment.
              </p>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                submit(input)
              }
            }}
            placeholder="Ask about the weather…"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            aria-label="Message the weather assistant"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  )
}
