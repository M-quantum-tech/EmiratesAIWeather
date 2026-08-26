import type { Metadata } from "next"
import { CompanyProfile } from "@/components/company/company-profile"
import { SiteNav } from "@/components/site-nav"

export const metadata: Metadata = {
  title: "Company Profile — M-Quantum-Tech",
  description:
    "M-Quantum-Tech is a pioneering quantum technology enterprise founded by Malik Basha Shaik, and the maker of EmiratesAIWeather — an AI-driven climate platform for the UAE.",
}

export default function CompanyPage() {
  return (
    <main className="min-h-dvh">
      <SiteNav />
      <CompanyProfile />
    </main>
  )
}
