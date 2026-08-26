import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode
  className?: string
  as?: "section" | "div" | "aside"
}) {
  return (
    <Tag
      className={cn(
        "relative rounded-lg border border-border bg-card/80 backdrop-blur-sm",
        "shadow-[inset_0_1px_0_oklch(1_0_0/6%)]",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function PanelHeader({
  title,
  meta,
  action,
  className,
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-2.5", className)}>
      <div className="flex shrink-0 items-center gap-2.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
        <h2 className="label-caps whitespace-nowrap text-foreground/80">{title}</h2>
      </div>
      {meta ? <span className="label-caps min-w-0 truncate">{meta}</span> : null}
      {action}
    </header>
  )
}

export function Readout({
  label,
  value,
  unit,
  detail,
  icon,
  tone = "default",
}: {
  label: string
  value: string
  unit?: string
  detail?: string
  icon?: ReactNode
  tone?: "default" | "good" | "moderate" | "warn" | "bad" | "muted"
}) {
  const toneClass = {
    default: "text-foreground",
    good: "text-accent",
    moderate: "text-signal",
    warn: "text-signal",
    bad: "text-destructive",
    muted: "text-muted-foreground",
  }[tone]

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="label-caps">{label}</span>
      </div>
      <p className={cn("font-mono text-2xl leading-none tabular-nums", toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </p>
      {detail ? <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p> : null}
    </div>
  )
}
