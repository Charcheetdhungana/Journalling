// GET /api/list -> [{ key, updated, deleted }] for everything stored.
export async function onRequestGet({ env }) {
  const out = [];
  let cursor;
  do {
    const page = await env.DAYBOOK.list({ cursor, limit: 1000 });
    for (const k of page.keys) out.push({ key: k.name, updated: k.metadata?.updated || 0, deleted: !!k.metadata?.deleted });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
