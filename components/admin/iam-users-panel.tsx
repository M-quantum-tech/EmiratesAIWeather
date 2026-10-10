"use client"

import type React from "react"
import { useState, useTransition } from "react"
import { Check, Download, KeyRound, Pencil, RotateCcw, Save, Trash2, Undo2, UserPlus, Users } from "lucide-react"
import {
  createIamUser,
  editIamUser,
  removeIamUser,
  setIamUserAccess,
  setIamUserCsvExport,
  setIamUserMirrorPush,
  setIamUserPassword,
  setIamUserRole,
} from "@/app/actions/iam"
import { IAM_ROLES, IAM_ROLE_CODES, iamCan, type IamRoleCode } from "@/lib/iam"
import { downloadIamCsv } from "@/lib/iam-csv"
import type { IamUserRow } from "@/lib/iam-server"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const inputClass =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

type AccessStatus = "allowed" | "denied"

export function IamUsersPanel({ users }: { users: IamUserRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [editFor, setEditFor] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ username: "", title: "" })
  const [draft, setDraft] = useState({ username: "", title: "", role: "Supervisor" as IamRoleCode, password: "" })

  const [stagedRoles, setStagedRoles] = useState<Record<string, IamRoleCode>>({})
  const [stagedAccess, setStagedAccess] = useState<Record<string, AccessStatus>>({})
  const [stagedDeletes, setStagedDeletes] = useState<string[]>([])
  const [stagedCsv, setStagedCsv] = useState<Record<string, boolean>>({})
  const [stagedMirror, setStagedMirror] = useState<Record<string, boolean>>({})

  const byId = new Map(users.map((u) => [u.id, u]))
  const roleChanges = Object.entries(stagedRoles).filter(
    ([id, role]) => byId.has(id) && byId.get(id)!.role !== role && !stagedDeletes.includes(id),
  )
  const accessChanges = Object.entries(stagedAccess).filter(([id, status]) => {
    const u = byId.get(id)
    return u && (u.accessStatus === "denied" ? "denied" : "allowed") !== status && !stagedDeletes.includes(id)
  })
  const csvChanges = Object.entries(stagedCsv).filter(
    ([id, allowed]) => byId.has(id) && byId.get(id)!.csvExport !== allowed && !stagedDeletes.includes(id),
  )
  const mirrorChanges = Object.entries(stagedMirror).filter(
    ([id, allowed]) => byId.has(id) && byId.get(id)!.mirrorPush !== allowed && !stagedDeletes.includes(id),
  )
  const deletes = stagedDeletes.filter((id) => byId.has(id))
  const changeCount = roleChanges.length + accessChanges.length + csvChanges.length + mirrorChanges.length + deletes.length

  const effective = users.map((u) => ({
    ...u,
    role: stagedRoles[u.id] ?? u.role,
    accessStatus: stagedAccess[u.id] ?? u.accessStatus,
    csvExport: stagedCsv[u.id] ?? u.csvExport,
    mirrorPush: stagedMirror[u.id] ?? u.mirrorPush,
  }))

  function discard() {
    setStagedRoles({})
    setStagedAccess({})
    setStagedCsv({})
    setStagedMirror({})
    setStagedDeletes([])
  }

  function run(action: () => Promise<unknown>, ok: string) {
    setMessage(null)
    startTransition(async () => {
      try {
        await action()
        setMessage({ tone: "ok", text: ok })
      } catch (err) {
        setMessage({ tone: "error", text: err instanceof Error ? err.message : "Action failed." })
      }
    })
  }

  function saveChanges() {
    const summary = [
      roleChanges.length ? `${roleChanges.length} role change${roleChanges.length > 1 ? "s" : ""}` : "",
      accessChanges.length ? `${accessChanges.length} status change${accessChanges.length > 1 ? "s" : ""}` : "",
      csvChanges.length ? `${csvChanges.length} CSV permission change${csvChanges.length > 1 ? "s" : ""}` : "",
      mirrorChanges.length ? `${mirrorChanges.length} push to mirror change${mirrorChanges.length > 1 ? "s" : ""}` : "",
      deletes.length ? `${deletes.length} deletion${deletes.length > 1 ? "s" : ""}` : "",
    ]
      .filter(Boolean)
      .join(", ")
    run(async () => {
      for (const [id, role] of roleChanges) await setIamUserRole(id, role)
      for (const [id, status] of accessChanges) await setIamUserAccess(id, status as AccessStatus)
      for (const [id, allowed] of csvChanges) await setIamUserCsvExport(id, allowed)
      for (const [id, allowed] of mirrorChanges) await setIamUserMirrorPush(id, allowed)
      for (const id of deletes) await removeIamUser(id)
      discard()
    }, `Saved: ${summary}.`)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    run(async () => {
      await createIamUser(draft.username, draft.title, draft.role, draft.password)
      setDraft({ username: "", title: "", role: "Supervisor", password: "" })
    }, `Created ${draft.username}.`)
  }

  return (
    <section aria-labelledby="iam-users-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="label-caps text-foreground">User management · Plant IAM</span>
          </div>
          <h2 id="iam-users-heading" className="text-lg font-semibold text-foreground">
            Control room logins & roles
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Role, status, CSV export, push to mirror and delete changes are staged — press Save changes to apply. Saved changes sign that user out immediately.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => downloadIamCsv(users)}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download CSV
        </Button>
      </div>

      {message ? (
        <p
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            message.tone === "ok"
              ? "border-alert-green/40 bg-alert-green/10 text-alert-green"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>
              <th scope="col" className="label-caps sticky left-0 z-10 bg-secondary px-3 py-2 font-normal">Username</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Role code</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Deep trends</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Status</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">CSV export</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Push to mirror</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Last sign in</th>
              <th scope="col" className="label-caps px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {effective.map((u) => {
              const original = byId.get(u.id)!
              const enabled = u.accessStatus !== "denied"
              const markedDelete = stagedDeletes.includes(u.id)
              const roleDirty = u.role !== original.role
              const accessDirty = (u.accessStatus === "denied") !== (original.accessStatus === "denied")
              const csvDirty = u.csvExport !== original.csvExport
              const mirrorDirty = u.mirrorPush !== original.mirrorPush
              return (
                <tr
                  key={u.id}
                  className={cn(
                    "align-middle",
                    markedDelete && "bg-destructive/10",
                    !markedDelete && (roleDirty || accessDirty || csvDirty || mirrorDirty) && "bg-primary/5",
                  )}
                >
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    {editFor === u.id ? (
                      <form
                        id={`edit-${u.id}`}
                        className="flex flex-col gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault()
                          run(async () => {
                            await editIamUser(u.id, editDraft.username, editDraft.title)
                            setEditFor(null)
                          }, `Updated ${editDraft.username.trim()}.`)
                        }}
                      >
                        <label className="sr-only" htmlFor={`edit-name-${u.id}`}>Username</label>
                        <input
                          id={`edit-name-${u.id}`}
                          value={editDraft.username}
                          maxLength={40}
                          onChange={(e) => setEditDraft({ ...editDraft, username: e.target.value })}
                          className={cn(inputClass, "w-40 font-mono")}
                        />
                        <label className="sr-only" htmlFor={`edit-title-${u.id}`}>Position title</label>
                        <input
                          id={`edit-title-${u.id}`}
                          value={editDraft.title}
                          maxLength={80}
                          placeholder="Position title"
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                          className={cn(inputClass, "h-8 w-40 text-xs")}
                        />
                      </form>
                    ) : (
                      <div className={cn(markedDelete && "line-through opacity-60")}>
                        <p className="font-mono font-semibold text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.title}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.username}</label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={pending || markedDelete}
                      onChange={(e) => setStagedRoles({ ...stagedRoles, [u.id]: e.target.value as IamRoleCode })}
                      className={cn(inputClass, roleDirty && "border-primary ring-1 ring-primary")}
                    >
                      {IAM_ROLE_CODES.map((code) => (
                        <option key={code} value={code}>{code} — {IAM_ROLES[code].title}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs uppercase">
                    {iamCan(u.role, "deepTrends") ? (
                      <span className="text-alert-green">Granted</span>
                    ) : (
                      <span className="text-muted-foreground">No access</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending || markedDelete}
                      aria-pressed={enabled}
                      onClick={() => setStagedAccess({ ...stagedAccess, [u.id]: enabled ? "denied" : "allowed" })}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-[0.1em]",
                        enabled ? "border-alert-green/50 text-alert-green" : "border-destructive/50 text-destructive",
                        accessDirty && "ring-1 ring-primary",
                      )}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending || markedDelete}
                      aria-pressed={u.csvExport}
                      aria-label={`CSV export for ${u.username}: ${u.csvExport ? "allowed" : "not allowed"}`}
                      onClick={() => setStagedCsv({ ...stagedCsv, [u.id]: !u.csvExport })}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-[0.1em]",
                        u.csvExport ? "border-alert-green/50 text-alert-green" : "border-destructive/50 text-destructive",
                        csvDirty && "ring-1 ring-primary",
                      )}
                    >
                      {u.csvExport ? "Allowed" : "Not allowed"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending || markedDelete}
                      aria-pressed={u.mirrorPush}
                      aria-label={`Push to mirror for ${u.username}: ${u.mirrorPush ? "allowed" : "not allowed"}`}
                      onClick={() => setStagedMirror({ ...stagedMirror, [u.id]: !u.mirrorPush })}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-[0.1em]",
                        u.mirrorPush ? "border-alert-green/50 text-alert-green" : "border-destructive/50 text-destructive",
                        mirrorDirty && "ring-1 ring-primary",
                      )}
                    >
                      {u.mirrorPush ? "Allowed" : "Not allowed"}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {editFor === u.id ? (
                        <>
                          <Button type="submit" form={`edit-${u.id}`} size="sm" disabled={pending || !editDraft.username.trim()}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditFor(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : markedDelete ? (
                        <>
                          <span className="font-mono text-xs uppercase text-destructive">Will be deleted</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setStagedDeletes(stagedDeletes.filter((id) => id !== u.id))}
                          >
                            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Undo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            aria-label={`Edit ${u.username}`}
                            onClick={() => {
                              setResetFor(null)
                              setEditDraft({ username: u.username, title: u.title })
                              setEditFor(u.id)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Button>
                          {resetFor === u.id ? (
                            <form
                              className="flex items-center gap-1.5"
                              onSubmit={(e) => {
                                e.preventDefault()
                                run(async () => {
                                  await setIamUserPassword(u.id, newPassword)
                                  setResetFor(null)
                                  setNewPassword("")
                                }, `Password reset for ${u.username}.`)
                              }}
                            >
                              <label className="sr-only" htmlFor={`pw-${u.id}`}>New password</label>
                              <input
                                id={`pw-${u.id}`}
                                type="password"
                                autoComplete="new-password"
                                placeholder="New password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className={cn(inputClass, "w-36")}
                              />
                              <Button type="submit" size="sm" disabled={pending || newPassword.length < 8}>Save</Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setResetFor(null)}>Cancel</Button>
                            </form>
                          ) : (
                            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setResetFor(u.id)}>
                              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                              Reset
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            aria-label={`Delete ${u.username}`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setResetFor(null)
                              setStagedDeletes([...stagedDeletes, u.id])
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div
        className={cn(
          "sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
          changeCount > 0 ? "border-primary/60 bg-card shadow-lg" : "border-border bg-secondary/30",
        )}
      >
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {changeCount > 0 ? (
            <>
              <span className="font-semibold text-foreground">{changeCount} unsaved change{changeCount > 1 ? "s" : ""}</span>
              {deletes.length > 0 ? ` · ${deletes.length} to delete (cannot be undone after save)` : ""}
            </>
          ) : (
            "No unsaved changes."
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={pending || changeCount === 0} onClick={discard}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Discard
          </Button>
          <Button type="button" size="sm" disabled={pending || changeCount === 0} onClick={saveChanges}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <span className="label-caps">Add login</span>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            aria-label="Username"
            placeholder="Username (e.g. Supervisor 3)"
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className={inputClass}
          />
          <input
            aria-label="Position title"
            placeholder="Position title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={inputClass}
          />
          <select
            aria-label="Role code"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value as IamRoleCode })}
            className={inputClass}
          >
            {IAM_ROLE_CODES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <input
            aria-label="Initial password"
            type="password"
            autoComplete="new-password"
            placeholder="Initial password (8+)"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            className={inputClass}
          />
        </div>
        <Button type="submit" size="sm" className="w-fit" disabled={pending || !draft.username.trim() || draft.password.length < 8}>
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Add user
        </Button>
      </form>
    </section>
  )
}
