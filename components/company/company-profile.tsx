import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Atom,
  Bell,
  Compass,
  Cpu,
  House,
  MapPinned,
  Plane,
  Quote,
  Radar,
  Shirt,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wind,
  type LucideIcon,
} from "lucide-react"
import {
  COMPANY,
  MODULES,
  PILLARS,
  PLATFORM_INTRO,
  STRATEGIC_IMPACT,
  type IconName,
} from "@/lib/company"

const ICONS: Record<IconName, LucideIcon> = {
  atom: Atom,
  cpu: Cpu,
  "shield-check": ShieldCheck,
  users: Users,
  sparkles: Sparkles,
  house: House,
  shirt: Shirt,
  radar: Radar,
  bell: Bell,
  wind: Wind,
  plane: Plane,
  "map-pinned": MapPinned,
  compass: Compass,
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="label-caps text-foreground/70">{children}</span>
    </div>
  )
}

export function CompanyProfile() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:px-6 lg:py-16">
      {/* Hero */}
      <section className="station-rise flex flex-col items-center gap-6 text-center">
        <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white shadow-lg shadow-accent/10">
          <Image
            src="/brand/m-quantum-tech.png"
            alt="M-Quantum-Tech logo"
            width={96}
            height={96}
            className="h-full w-full object-contain"
            priority
          />
        </span>
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            {COMPANY.name}
          </h1>
          <p className="label-caps text-accent">{COMPANY.tagline}</p>
        </div>
        <p className="max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {COMPANY.intro}
        </p>
      </section>

      {/* Founder */}
      <section className="flex flex-col gap-6">
        <SectionLabel>The Visionary Leader</SectionLabel>
        <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1fr_1.7fr] lg:gap-10">
          <div className="flex flex-col gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/12 text-accent">
              <Quote className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xl font-medium tracking-tight text-foreground">{COMPANY.founder}</p>
              <p className="label-caps">{COMPANY.founderRole}</p>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-pretty leading-relaxed text-muted-foreground">{COMPANY.founderStatement}</p>
            <p className="text-pretty font-medium leading-relaxed text-foreground">{COMPANY.founderClose}</p>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="flex flex-col gap-6">
        <SectionLabel>Core Pillars of Innovation</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((pillar) => {
            const Icon = ICONS[pillar.icon]
            return (
              <article
                key={pillar.title}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-accent/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-medium tracking-tight text-foreground">{pillar.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* EmiratesAIWeather platform */}
      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <SectionLabel>Flagship Platform</SectionLabel>
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Emirates<span className="text-accent">AI</span>Weather
          </h2>
          <p className="max-w-3xl text-pretty leading-relaxed text-muted-foreground">{PLATFORM_INTRO}</p>
        </div>

        <div className="flex flex-col gap-10">
          {MODULES.map((module) => (
            <div key={module.index} className="flex flex-col gap-5">
              <div className="flex items-baseline gap-4 border-b border-border pb-4">
                <span className="font-mono text-sm text-accent tabular-nums">{module.index}</span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-medium tracking-tight text-foreground">{module.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{module.summary}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {module.features.map((feature) => {
                  const Icon = ICONS[feature.icon]
                  return (
                    <article key={feature.title} className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h4 className="text-sm font-medium tracking-tight text-foreground">{feature.title}</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Strategic impact */}
      <section className="flex flex-col gap-6 rounded-xl border border-accent/25 bg-accent/[0.06] p-6 sm:p-10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Target className="h-5 w-5" aria-hidden="true" />
          </span>
          <SectionLabel>Strategic Impact</SectionLabel>
        </div>
        <p className="max-w-4xl text-pretty text-lg leading-relaxed text-foreground">{STRATEGIC_IMPACT}</p>
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Open the Weather Station
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
