import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { describeCode } from "@/lib/weather"

type Props = {
  code: number
  isDay?: boolean
  className?: string
  strokeWidth?: number
}

export function WeatherIcon({ code, isDay = true, className, strokeWidth = 1.5 }: Props) {
  const { group, label } = describeCode(code)

  const Icon = (() => {
    switch (group) {
      case "clear":
        if (code === 0) return isDay ? Sun : Moon
        return isDay ? CloudSun : CloudMoon
      case "cloud":
        return code === 2 ? (isDay ? CloudSun : CloudMoon) : Cloud
      case "fog":
        return CloudFog
      case "drizzle":
        return CloudDrizzle
      case "rain":
        return CloudRain
      case "snow":
        return CloudSnow
      case "storm":
        return CloudLightning
      default:
        return Cloud
    }
  })()

  return <Icon aria-label={label} className={cn("shrink-0", className)} strokeWidth={strokeWidth} />
}
