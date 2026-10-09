"use client"

import { Download, Users } from "lucide-react"
import { IAM_ROLES, iamCan } from "@/lib/iam"
import { downloadIamCsv } from "@/lib/iam-csv"
import type { IamUserRow } from "@/lib/iam-server"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function IamRosterReadonly({ users }: { users: IamUserRow[] }) {
  return (
    <section aria-labelledby="iam-roster-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="label-caps text-foreground">Plant IAM · Read only</span>
          </div>
          <h2 id="iam-roster-heading" className="text-lg font-semibold text-foreground">
            Control room logins & access
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Managed by the system administrator. Contact an administrator to change a role or access.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => downloadIamCsv(users)}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Username</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Role</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Deep trends</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Status</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">CSV export</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Last sign in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const enabled = u.accessStatus !== "denied"
              return (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <p className="font-mono font-semibold text-foreground">{u.username}</p>
                    <p className="text-xs text-muted-foreground">{u.title}</p>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <span className="font-mono font-semibold">{u.role}</span>
                    <span className="text-muted-foreground"> — {IAM_ROLES[u.role].title}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs uppercase">
                    {iamCan(u.role, "deepTrends") ? (
                      <span className="text-alert-green">Granted</span>
                    ) : (
                      <span className="text-muted-foreground">No access</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-[0.1em]",
                        enabled ? "border-alert-green/50 text-alert-green" : "border-destructive/50 text-destructive",
                      )}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs uppercase">
                    {u.csvExport ? (
                      <span className="text-alert-green">Allowed</span>
                    ) : (
                      <span className="text-muted-foreground">Not allowed</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : "Never"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
