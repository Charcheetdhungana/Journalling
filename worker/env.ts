export interface Env {
  DB: D1Database
  SCREENSHOTS: R2Bucket
  /** Cloudflare Zero Trust team name (https://<TEAM_NAME>.cloudflareaccess.com). */
  TEAM_NAME: string
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD: string
  /** Local development only (.dev.vars). Ignored unless the request host is localhost. */
  DEV_BYPASS_AUTH?: string
}

export type AppEnv = { Bindings: Env }
