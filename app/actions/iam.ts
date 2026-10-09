"use server"

import { revalidatePath } from "next/cache"
import { isAdmin } from "@/lib/admin"
import { addIamUser, deleteIamUser, resetIamPassword, updateIamUser } from "@/lib/iam-server"
import { isIamRoleCode, iamUsernameKey } from "@/lib/iam"

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden")
}

function validPassword(password: string) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Password must be 8–128 characters.")
  }
}

export async function setIamUserRole(userId: string, role: string) {
  await guard()
  if (!isIamRoleCode(role)) throw new Error("Invalid role code.")
  await updateIamUser(userId, { role })
  revalidatePath("/admin/engineering")
}

export async function setIamUserTitle(userId: string, title: string) {
  await guard()
  await updateIamUser(userId, { title: String(title).trim().slice(0, 80) })
  revalidatePath("/admin/engineering")
}

export async function editIamUser(userId: string, username: string, title: string) {
  await guard()
  const name = String(username).trim().slice(0, 40)
  if (!iamUsernameKey(name)) throw new Error("Username is required.")
  await updateIamUser(userId, { username: name, title: String(title).trim().slice(0, 80) })
  revalidatePath("/admin/engineering")
}

export async function setIamUserAccess(userId: string, accessStatus: "allowed" | "denied") {
  await guard()
  if (accessStatus !== "allowed" && accessStatus !== "denied") throw new Error("Invalid status.")
  await updateIamUser(userId, { accessStatus })
  revalidatePath("/admin/engineering")
}

export async function setIamUserPassword(userId: string, password: string) {
  await guard()
  validPassword(password)
  await resetIamPassword(userId, password)
}

export async function createIamUser(username: string, title: string, role: string, password: string) {
  await guard()
  const name = String(username).trim().slice(0, 40)
  if (!iamUsernameKey(name)) throw new Error("Username is required.")
  if (!isIamRoleCode(role)) throw new Error("Invalid role code.")
  validPassword(password)
  await addIamUser(name, String(title).trim().slice(0, 80), role, password)
  revalidatePath("/admin/engineering")
}

export async function removeIamUser(userId: string) {
  await guard()
  await deleteIamUser(userId)
  revalidatePath("/admin/engineering")
}
