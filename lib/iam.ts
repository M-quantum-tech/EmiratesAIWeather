/**
 * Plant Identity & Access Management (IAM) model. Client-safe: no secrets,
 * no DB access. Defines the SCADA role codes, what each role may do, and the
 * seeded login roster.
 */

export type IamRoleCode = "PGM" | "OM" | "Supervisor" | "CRO"

export type IamCapability =
  | "liveMonitoring"
  | "reporting"
  | "alarmAck"
  | "setpointLimits"
  | "overrides"
  | "realtimeControl"
  | "deepTrends"

export interface IamRoleDef {
  code: IamRoleCode
  title: string
  controlLevel: string
  scadaRole: string
  capabilities: IamCapability[]
}

export const IAM_ROLES: Record<IamRoleCode, IamRoleDef> = {
  PGM: {
    code: "PGM",
    title: "Plant General Manager",
    controlLevel: "Read-Only / High-Level Reporting",
    scadaRole: "Plant_Manager_Viewer / Executive_Read_Only",
    capabilities: ["liveMonitoring", "reporting", "deepTrends"],
  },
  OM: {
    code: "OM",
    title: "Operations Manager",
    controlLevel: "Operational Scope Change / Overrides",
    scadaRole: "Operations_Manager / Ops_Admin",
    capabilities: ["liveMonitoring", "reporting", "alarmAck", "setpointLimits", "overrides", "deepTrends"],
  },
  Supervisor: {
    code: "Supervisor",
    title: "Shift / Area Supervisor",
    controlLevel: "Multi-Unit Acknowledgment & Setpoint Limits",
    scadaRole: "Shift_Supervisor / Area_Supervisor",
    capabilities: ["liveMonitoring", "alarmAck", "setpointLimits", "deepTrends"],
  },
  CRO: {
    code: "CRO",
    title: "Control Room Operator",
    controlLevel: "Full Real-time Control / Action Execution",
    scadaRole: "Control_Room_Operator / Console_Operator",
    capabilities: ["liveMonitoring", "alarmAck", "realtimeControl"],
  },
}

export const IAM_ROLE_CODES = Object.keys(IAM_ROLES) as IamRoleCode[]

export const CAPABILITY_LABELS: Record<IamCapability, string> = {
  liveMonitoring: "Live monitoring",
  reporting: "High-level reporting",
  alarmAck: "Alarm acknowledgment",
  setpointLimits: "Setpoint limits",
  overrides: "Scope change / overrides",
  realtimeControl: "Real-time control / action execution",
  deepTrends: "Deep trend analysis",
}

export function isIamRoleCode(value: unknown): value is IamRoleCode {
  return typeof value === "string" && value in IAM_ROLES
}

export function iamCan(role: IamRoleCode | null | undefined, capability: IamCapability): boolean {
  return Boolean(role) && IAM_ROLES[role as IamRoleCode].capabilities.includes(capability)
}

export interface IamSeedUser {
  username: string
  /** Position title shown on the dashboard (may differ from the role title). */
  title: string
  role: IamRoleCode
}

export const IAM_SEED_USERS: IamSeedUser[] = [
  { username: "PGM", title: "Plant General Manager", role: "PGM" },
  { username: "D_PGM", title: "Deputy Plant General Manager", role: "PGM" },
  { username: "OM", title: "Operations Manager", role: "OM" },
  { username: "D_OM", title: "Deputy Operations Manager", role: "OM" },
  { username: "Section Head 1", title: "Operation Section Manager", role: "OM" },
  { username: "Section Head 2", title: "Operation Section Manager", role: "OM" },
  ...Array.from({ length: 12 }, (_, i) => ({
    username: `Supervisor ${i + 1}`,
    title: "Shift / Area Supervisor",
    role: "Supervisor" as const,
  })),
  { username: "CRO 1", title: "Control Room Operator", role: "CRO" },
  { username: "CRO 2", title: "Control Room Operator", role: "CRO" },
]

const IAM_EMAIL_DOMAIN = "iam.ne1csp.ae"

/** Normalise a typed username ("Section Head 1") to its login key ("section-head-1"). */
export function iamUsernameKey(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
}

/** The internal Better Auth email that backs a plant username. */
export function iamEmailFor(username: string): string {
  return `${iamUsernameKey(username)}@${IAM_EMAIL_DOMAIN}`
}

export function isIamEmail(email: string | null | undefined): boolean {
  return Boolean(email) && (email as string).toLowerCase().endsWith(`@${IAM_EMAIL_DOMAIN}`)
}
