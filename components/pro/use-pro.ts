"use client"

import useSWR from "swr"

export type AccessState = "signed-out" | "allowed" | "pending" | "denied" | "expired" | "scheduled"

type MeResponse = {
  authed: boolean
  isPro: boolean
  plan: string | null
  access?: AccessState
  isAdmin?: boolean
  serviceStart?: string | null
  serviceEnd?: string | null
}

async function fetcher(url: string): Promise<MeResponse> {
  const res = await fetch(url)
  if (!res.ok) return { authed: false, isPro: false, plan: null, access: "signed-out" }
  return res.json()
}

export function usePro() {
  const { data, isLoading, mutate } = useSWR<MeResponse>("/api/me", fetcher, {
    revalidateOnFocus: true,
  })
  return {
    authed: data?.authed ?? false,
    isPro: data?.isPro ?? false,
    plan: data?.plan ?? null,
    access: (data?.access ?? "signed-out") as AccessState,
    isAdmin: data?.isAdmin ?? false,
    serviceStart: data?.serviceStart ?? null,
    serviceEnd: data?.serviceEnd ?? null,
    isLoading,
    refresh: mutate,
  }
}
