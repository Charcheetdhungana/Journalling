// Every /api request must carry a valid Cloudflare Access login token.
// Set these in Pages > Settings > Variables and Secrets:
//   ACCESS_TEAM_DOMAIN  e.g. yourteam.cloudflareaccess.com
//   ACCESS_AUD          the Application Audience (AUD) tag of your Access app
//   ALLOWED_EMAIL       (optional) only this email may use the API
// and bind a KV namespace named DAYBOOK.

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

let certCache = { at: 0, keys: null, team: '' };
async function signingKeys(team) {
  if (certCache.keys && certCache.team === team && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs');
  certCache = { at: Date.now(), keys: (await res.json()).keys, team };
  return certCache.keys;
}

async function verify(token, env) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('shape');
  const header = b64urlJson(h);
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwk = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('sig');
  const claims = b64urlJson(p);
  const aud = [].concat(claims.aud || []);
  if (!aud.includes(env.ACCESS_AUD)) throw new Error('aud');
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error('iss');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('exp');
  return claims;
}

export async function onRequest({ request, env, next }) {
  if (!env.DAYBOOK) return json({ error: 'KV binding DAYBOOK is missing' }, 503);
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return json({ error: 'Cloudflare Access is not configured' }, 503);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return json({ error: 'Sign-in required' }, 401);
  let claims;
  try { claims = await verify(token, env); } catch { return json({ error: 'Invalid sign-in' }, 401); }
  if (env.ALLOWED_EMAIL && String(claims.email || '').toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) return json({ error: 'Not allowed' }, 403);
  return next();
}
