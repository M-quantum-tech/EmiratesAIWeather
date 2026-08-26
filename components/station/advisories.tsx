import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react"
import { Panel, PanelHeader } from "@/components/station/panel"
import { buildAdvisories, type WeatherPayload } from "@/lib/weather"
import { cn } from "@/lib/utils"

export function Advisories({ data }: { data: WeatherPayload }) {
  const advisories = buildAdvisories(data)

  return (
    <Panel className="station-rise">
      <PanelHeader
        title="Monitoring"
        meta={advisories.length ? `${advisories.length} active` : "All clear"}
      />

      {advisories.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6">
          <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted-foreground text-pretty">
            No thresholds exceeded. Conditions are within normal local limits.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {advisories.map((advisory) => {
            const warning = advisory.level === "warning"
            const Icon = warning ? TriangleAlert : CircleAlert
            return (
              <li key={advisory.id} className="flex gap-3 px-4 py-3">
                <Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", warning ? "text-destructive" : "text-signal")}
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{advisory.title}</p>
                    <span
                      className={cn(
                        "label-caps rounded-sm border px-1.5 py-0.5 text-[0.5625rem]",
                        warning ? "border-destructive/50 text-destructive" : "border-signal/40 text-signal",
                      )}
                    >
                      {advisory.level}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{advisory.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
