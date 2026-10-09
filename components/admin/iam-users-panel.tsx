"use client"

import type React from "react"
import { useState, useTransition } from "react"
import { Check, KeyRound, Pencil, Trash2, UserPlus, Users } from "lucide-react"
import {
  createIamUser,
  editIamUser,
  removeIamUser,
  setIamUserAccess,
  setIamUserPassword,
  setIamUserRole,
} from "@/app/actions/iam"
import { IAM_ROLES, IAM_ROLE_CODES, iamCan, type IamRoleCode } from "@/lib/iam"
import type { IamUserRow } from "@/lib/iam-server"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const inputClass =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function IamUsersPanel({ users }: { users: IamUserRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [editFor, setEditFor] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ username: "", title: "" })
  const [deleteFor, setDeleteFor] = useState<string | null>(null)
  const [draft, setDraft] = useState({ username: "", title: "", role: "Supervisor" as IamRoleCode, password: "" })

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    run(async () => {
      await createIamUser(draft.username, draft.title, draft.role, draft.password)
      setDraft({ username: "", title: "", role: "Supervisor", password: "" })
    }, `Created ${draft.username}.`)
  }

  return (
    <section aria-labelledby="iam-users-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="label-caps text-foreground">User management · Plant IAM</span>
        </div>
        <h2 id="iam-users-heading" className="text-lg font-semibold text-foreground">
          Control room logins & roles
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Changing a role, disabling an account, or resetting a password signs that user out immediately.
        </p>
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
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Username</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Role code</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Deep trends</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Status</th>
              <th scope="col" className="label-caps px-3 py-2 font-normal">Last sign in</th>
              <th scope="col" className="label-caps px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const enabled = u.accessStatus !== "denied"
              return (
                <tr key={u.id} className="align-middle">
                  <td className="px-3 py-2">
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
                      <>
                        <p className="font-mono font-semibold text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.title}</p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.username}</label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={pending}
                      onChange={(e) => run(() => setIamUserRole(u.id, e.target.value), `${u.username} is now ${e.target.value}.`)}
                      className={inputClass}
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
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setIamUserAccess(u.id, enabled ? "denied" : "allowed"),
                          `${u.username} ${enabled ? "disabled" : "enabled"}.`,
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-[0.1em]",
                        enabled ? "border-alert-green/50 text-alert-green" : "border-destructive/50 text-destructive",
                      )}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {editFor === u.id ? (
                        <>
                          <Button
                            type="submit"
                            form={`edit-${u.id}`}
                            size="sm"
                            disabled={pending || !editDraft.username.trim()}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditFor(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : deleteFor === u.id ? (
                        <>
                          <span className="font-mono text-xs uppercase text-destructive">Delete?</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() =>
                              run(async () => {
                                await removeIamUser(u.id)
                                setDeleteFor(null)
                              }, `${u.username} deleted.`)
                            }
                          >
                            Confirm
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteFor(null)}>
                            Cancel
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
                          setDeleteFor(null)
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
                          setDeleteFor(u.id)
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

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <span className="label-caps">Add login</span>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            aria-label="Username"
            placeholder="Username (e.g. Supervisor 13)"
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
