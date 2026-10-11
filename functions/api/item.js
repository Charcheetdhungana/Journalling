// GET /api/item?key=...  -> { updated, deleted?, data? }
// PUT /api/item?key=...  body { updated, deleted?, data? }
// Keys: e:YYYY-MM-DD (journal entry), w:YYYY-MM-DD (week, keyed by its Monday),
//       s:<id> (notebook section), n:<id> (notebook topic).
const KEY = /^([ew]:\d{4}-\d{2}-\d{2}|[sn]:[a-z0-9]{1,40})$/i;
const MAX_BYTES = 20 * 1024 * 1024; // KV allows 25 MB per value

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!KEY.test(key)) return reply({ error: 'Bad key' }, 400);
  const value = await env.DAYBOOK.get(key);
  if (value == null) return reply({ error: 'Not found' }, 404);
  return new Response(value, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function onRequestPut({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!KEY.test(key)) return reply({ error: 'Bad key' }, 400);
  const text = await request.text();
  if (text.length > MAX_BYTES) return reply({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return reply({ error: 'Bad JSON' }, 400); }
  const updated = Number(body && body.updated);
  if (!Number.isFinite(updated) || updated < 0) return reply({ error: 'Bad updated' }, 400);
  const deleted = body.deleted === true;
  if (!deleted && (typeof body.data !== 'object' || body.data === null)) return reply({ error: 'Missing data' }, 400);

  // never let an older copy overwrite a newer one
  const { metadata } = await env.DAYBOOK.getWithMetadata(key);
  if (metadata && metadata.updated > updated) return reply({ ok: false, reason: 'newer on server' }, 409);

  const stored = deleted ? { updated, deleted: true } : { updated, data: body.data };
  await env.DAYBOOK.put(key, JSON.stringify(stored), { metadata: { updated, deleted } });
  return reply({ ok: true });
}
