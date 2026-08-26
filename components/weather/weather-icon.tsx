import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, CloudSun } from "lucide-react"
import { describeCode } from "@/lib/weather"
import { cn } from "@/lib/utils"

const GROUP_ICON = {
  clear: Sun,
  cloud: CloudSun,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
} as const

const GROUP_TONE = {
  clear: "text-signal",
  cloud: "text-muted-foreground",
  fog: "text-muted-foreground",
  drizzle: "text-accent",
  rain: "text-accent",
  snow: "text-foreground",
  storm: "text-destructive",
} as const

export function WeatherIcon({
  code,
  className,
  overcast = false,
}: {
  code: number
  className?: string
  overcast?: boolean
}) {
  const group = describeCode(code).group
  const Icon = overcast && group === "cloud" ? Cloud : GROUP_ICON[group]
  return <Icon className={cn(GROUP_TONE[group], className)} aria-hidden="true" />
}
