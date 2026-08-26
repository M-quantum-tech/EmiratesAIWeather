import { Building2, Check, Clock, Sparkles, Timer, User, Zap } from "lucide-react"
import type { Plan } from "@/lib/plans"
import { cn } from "@/lib/utils"
import { CheckoutButton } from "@/components/pricing/checkout-button"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  company: Building2,
  personal: User,
  pass_10m: Clock,
  pass_30m: Timer,
  pass_60m: Zap,
}

export function PricingCards({
  plans,
  isAuthed,
  columns = 2,
}: {
  plans: Plan[]
  isAuthed: boolean
  columns?: 2 | 3
}) {
  return (
    <div className={cn("grid gap-6", columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} isAuthed={isAuthed} />
      ))}
    </div>
  )
}

function PlanCard({ plan, isAuthed }: { plan: Plan; isAuthed: boolean }) {
  const Icon = ICONS[plan.id] ?? Sparkles
  const isPass = plan.kind === "pass"
  const cta = isAuthed ? (isPass ? `Buy ${plan.name}` : `Subscribe to ${plan.name}`) : `Get ${plan.name}`

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-6 sm:p-8",
        plan.featured ? "border-accent/60 shadow-2xl ring-1 ring-accent/30" : "border-border",
      )}
    >
      {plan.featured ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-accent-foreground">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {isPass ? "Best value" : "Most popular"}
        </span>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-accent">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h2>
          <p className="label-caps">{plan.audience}</p>
        </div>
      </div>

      <p className="mt-4 text-pretty text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-6 flex items-end gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{plan.priceLabel}</span>
        <span className="mb-1 text-sm text-muted-foreground">{plan.cadenceLabel}</span>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <CheckoutButton planId={plan.id} isAuthed={isAuthed} label={cta} featured={plan.featured} />
    </div>
  )
}
