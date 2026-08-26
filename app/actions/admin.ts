"use server"

import { revalidatePath } from "next/cache"
import { isAdmin, setUserRole } from "@/lib/admin"

export async function updateRole(userId: string, role: "admin" | "user") {
  if (!(await isAdmin())) throw new Error("Forbidden")
  await setUserRole(userId, role)
  revalidatePath("/admin")
}
