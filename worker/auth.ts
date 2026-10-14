import { createMiddleware } from 'hono/factory'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppEnv } from './env'

type Jwks = ReturnType<typeof createRemoteJWKSet>
const jwksByTeam = new Map<string, Jwks>()

function getJwks(teamDomain: string): Jwks {
  let jwks = jwksByTeam.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksByTeam.set(teamDomain, jwks)
  }
  return jwks
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function teamDomainFrom(teamName: string): string {
  const cleaned = teamName.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return cleaned.endsWith('.cloudflareaccess.com') ? cleaned : `${cleaned}.cloudflareaccess.com`
}

function unauthorized(message: string): Response {
  return Response.json({ error: message }, { status: 401 })
}

/**
 * Verifies the Cf-Access-Jwt-Assertion header on every /api/* request:
 * signature (Access public keys), issuer and audience. Fails closed.
 *
 * DEV_BYPASS_AUTH=true is honoured ONLY when the request host is localhost, so even if the
 * variable were set by mistake in production it has no effect on the real domain.
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const hostname = new URL(c.req.url).hostname

  if (c.env.DEV_BYPASS_AUTH === 'true') {
    if (isLocalHost(hostname)) {
      await next()
      return
    }
    console.warn('DEV_BYPASS_AUTH is set but ignored: request host is not localhost')
  }

  const teamName = c.env.TEAM_NAME
  const audience = c.env.ACCESS_AUD
  if (!teamName || !audience || teamName.startsWith('REPLACE') || audience.startsWith('REPLACE')) {
    console.error('TEAM_NAME / ACCESS_AUD are not configured; refusing all API requests')
    return c.json({ error: 'Server authentication is not configured' }, 500)
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) return unauthorized('Missing Cf-Access-Jwt-Assertion header')

  const teamDomain = teamDomainFrom(teamName)
  try {
    await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    })
  } catch {
    return unauthorized('Invalid Access token')
  }
  await next()
})
