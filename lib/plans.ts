export type PlanId = "company" | "personal" | "pass_10m" | "pass_30m" | "pass_60m"
export type PlanKind = "subscription" | "pass"
export type Interval = "month" | "day" | "minute"

export interface Plan {
  id: PlanId
  kind: PlanKind
  name: string
  tagline: string
  priceCents: number
  interval: Interval
  /** Access window for one-time passes. */
  durationMinutes?: number
  priceLabel: string
  cadenceLabel: string
  audience: string
  features: string[]
  featured?: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  company: {
    id: "company",
    kind: "subscription",
    name: "Company Pro",
    tagline: "Enterprise-grade climate intelligence for teams",
    priceCents: 10000,
    interval: "month",
    priceLabel: "$100",
    cadenceLabel: "per month",
    audience: "For organisations & operations teams",
    features: [
      "Unlimited monitored locations",
      "AI precision forecasting & severe-weather alerts",
      "Team seats with shared dashboards",
      "API access for automation & integrations",
      "Priority support & 99.9% uptime SLA",
      "Historical data & analytics export",
    ],
    featured: true,
  },
  personal: {
    id: "personal",
    kind: "subscription",
    name: "Personal Pro",
    tagline: "Full-power forecasting for everyday decisions",
    priceCents: 1000,
    interval: "day",
    priceLabel: "$10",
    cadenceLabel: "per day",
    audience: "For individuals & personal use",
    features: [
      "Up to 5 saved locations",
      "AI lifestyle & activity recommendations",
      "Hourly precision + 7-day outlook",
      "Air-quality & health advisories",
      "Ad-free experience",
      "Cancel anytime",
    ],
  },
  pass_10m: {
    id: "pass_10m",
    kind: "pass",
    name: "10-Minute Pass",
    tagline: "A quick look before you head out",
    priceCents: 300,
    interval: "minute",
    durationMinutes: 10,
    priceLabel: "$3",
    cadenceLabel: "one-time · 10 min",
    audience: "Pay-as-you-go access",
    features: [
      "10 minutes of full Pro access",
      "AI precision forecast & radar",
      "Air-quality & severe-weather alerts",
      "No account subscription required",
    ],
  },
  pass_30m: {
    id: "pass_30m",
    kind: "pass",
    name: "30-Minute Pass",
    tagline: "Plan the afternoon in detail",
    priceCents: 500,
    interval: "minute",
    durationMinutes: 30,
    priceLabel: "$5",
    cadenceLabel: "one-time · 30 min",
    audience: "Pay-as-you-go access",
    features: [
      "30 minutes of full Pro access",
      "AI precision forecast & radar",
      "Air-quality & severe-weather alerts",
      "Best value for short sessions",
    ],
    featured: true,
  },
  pass_60m: {
    id: "pass_60m",
    kind: "pass",
    name: "1-Hour Pass",
    tagline: "Deep-dive planning for the day ahead",
    priceCents: 700,
    interval: "minute",
    durationMinutes: 60,
    priceLabel: "$7",
    cadenceLabel: "one-time · 1 hr",
    audience: "Pay-as-you-go access",
    features: [
      "60 minutes of full Pro access",
      "AI precision forecast & radar",
      "Air-quality & severe-weather alerts",
      "Ideal for trip & event planning",
    ],
  },
}

/** Recurring Pro subscriptions. */
export const PLAN_LIST: Plan[] = [PLANS.company, PLANS.personal]

/** One-time time-based access passes. */
export const PASS_LIST: Plan[] = [PLANS.pass_10m, PLANS.pass_30m, PLANS.pass_60m]

export function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`
}
