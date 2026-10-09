import { IAM_ROLES, iamCan, type IamRoleCode } from "@/lib/iam"

export interface IamCsvRow {
  username: string
  title: string
  role: IamRoleCode
  accessStatus: string
  csvExport: boolean
  lastSignIn: Date | string | null
}

function cell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function iamUsersToCsv(users: IamCsvRow[]) {
  const header = ["Username", "Position title", "Role code", "Role title", "Deep trends", "Status", "CSV export", "Last sign in"]
  const lines = users.map((u) =>
    [
      u.username,
      u.title,
      u.role,
      IAM_ROLES[u.role].title,
      iamCan(u.role, "deepTrends") ? "Granted" : "No access",
      u.accessStatus === "denied" ? "Disabled" : "Enabled",
      u.csvExport ? "Allowed" : "Not allowed",
      u.lastSignIn ? new Date(u.lastSignIn).toISOString() : "Never",
    ]
      .map((v) => cell(String(v)))
      .join(","),
  )
  return [header.join(","), ...lines].join("\r\n")
}

export function downloadIamCsv(users: IamCsvRow[]) {
  const blob = new Blob(["\uFEFF" + iamUsersToCsv(users)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `plant-iam-users-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
