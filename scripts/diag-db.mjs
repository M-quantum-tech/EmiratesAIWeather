import { db } from "../lib/db/index.ts"
import { account, user } from "../lib/db/schema.ts"
import { and, eq } from "drizzle-orm"
import { verifyPassword } from "better-auth/crypto"

const emails = ["m-quantum-tech@mquantum.tech", "m-quantum-tech007@mquantum.tech"]
const pw = { "m-quantum-tech@mquantum.tech": "Imax@1993", "m-quantum-tech007@mquantum.tech": "Imax@2026" }

for (const email of emails) {
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (rows.length === 0) {
    console.log(email, "-> MISSING")
    continue
  }
  const u = rows[0]
  const cred = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
    .limit(1)
  let verifies = false
  if (cred.length && cred[0].password) {
    try {
      verifies = await verifyPassword({ hash: cred[0].password, password: pw[email] })
    } catch (e) {
      verifies = "ERR:" + e.message
    }
  }
  console.log(email, "-> role:", u.role, "access:", u.accessStatus, "cred:", cred.length, "issuer:", cred[0]?.issuer, "verifies:", verifies)
}
process.exit(0)
