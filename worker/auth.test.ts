import { Hono } from 'hono'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppEnv, Env } from './env'

const keys = vi.hoisted(() => ({ jwks: undefined as unknown }))

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    // Use an in-memory key set instead of fetching https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
    createRemoteJWKSet: () => keys.jwks,
  }
})

const { requireAccess } = await import('./auth')

const TEAM = 'myteam'
const AUD = 'aud-tag-123'

function makeApp() {
  const app = new Hono<AppEnv>()
  app.use('/api/*', requireAccess)
  app.get('/api/ping', (c) => c.json({ ok: true }))
  return app
}

function env(overrides: Partial<Env> = {}): Env {
  return { TEAM_NAME: TEAM, ACCESS_AUD: AUD, ...overrides } as Env
}

let privateKey: CryptoKey
let otherKey: CryptoKey

async function token(opts: { aud?: string; iss?: string; key?: CryptoKey; kid?: string } = {}): Promise<string> {
  return new SignJWT({ email: 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
    .setIssuer(opts.iss ?? `https://${TEAM}.cloudflareaccess.com`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(opts.key ?? privateKey)
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const other = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherKey = other.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  keys.jwks = createLocalJWKSet({ keys: [jwk] })
})

async function call(headers: Record<string, string>, environment: Env, url = 'https://journal.example.com/api/ping') {
  return makeApp().request(url, { headers }, environment)
}

describe('requireAccess', () => {
  it('accepts a correctly signed token with the right audience and issuer', async () => {
    const res = await call({ 'Cf-Access-Jwt-Assertion': await token() }, env())
    expect(res.status).toBe(200)
  })

  it('rejects a request with no token', async () => {
    const res = await call({}, env())
    expect(res.status).toBe(401)
  })

  it('rejects a malformed token', async () => {
    const res = await call({ 'Cf-Access-Jwt-Assertion': 'not-a-jwt' }, env())
    expect(res.status).toBe(401)
  })

  it('rejects the wrong audience', async () => {
    const res = await call({ 'Cf-Access-Jwt-Assertion': await token({ aud: 'someone-else' }) }, env())
    expect(res.status).toBe(401)
  })

  it('rejects the wrong issuer', async () => {
    const res = await call(
      { 'Cf-Access-Jwt-Assertion': await token({ iss: 'https://evil.cloudflareaccess.com' }) },
      env(),
    )
    expect(res.status).toBe(401)
  })

  it('rejects a token signed with a different key', async () => {
    const res = await call({ 'Cf-Access-Jwt-Assertion': await token({ key: otherKey }) }, env())
    expect(res.status).toBe(401)
  })

  it('fails closed when TEAM_NAME / ACCESS_AUD are not configured', async () => {
    const res = await call(
      { 'Cf-Access-Jwt-Assertion': await token() },
      env({ TEAM_NAME: 'REPLACE_WITH_TEAM_NAME', ACCESS_AUD: 'REPLACE_WITH_ACCESS_AUD' }),
    )
    expect(res.status).toBe(500)
  })

  it('DEV_BYPASS_AUTH works on localhost', async () => {
    const res = await call({}, env({ DEV_BYPASS_AUTH: 'true' }), 'http://localhost:5173/api/ping')
    expect(res.status).toBe(200)
  })

  it('DEV_BYPASS_AUTH is ignored on any non-local host', async () => {
    const res = await call({}, env({ DEV_BYPASS_AUTH: 'true' }), 'https://journal.example.com/api/ping')
    expect(res.status).toBe(401)
  })
})
