"use client"

import useSWR from "swr"

type MeResponse = { authed: boolean; isPro: boolean; plan: string | null }

async function fetcher(url: string): Promise<MeResponse> {
  const res = await fetch(url)
  if (!res.ok) return { authed: false, isPro: false, plan: null }
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
    isLoading,
    refresh: mutate,
  }
}
