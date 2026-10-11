// GET /api/quotes?symbols=TLN,CEG&end=2026-10-09
// One-week change for each symbol, worked out from Yahoo Finance's public chart data.
// It's the same data its website charts use. There is no API key, and Yahoo does not promise it stays available.
//
// "end" is the last day to count. The result compares that day's close (or the last close before it)
// with the close a week earlier, so end=2026-10-09 gives the Oct 2 to Oct 9 change.

const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
const MAX_SYMBOLS = 40; // Pages Functions allow 50 outgoing requests per call on the free plan
const DAY = 86400;

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const dateOf = (seconds, offset) => new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
const round3 = n => Math.round(n * 1000) / 1000;

export async function weekChange(symbol, endDate, doFetch = fetch) {
  const end = Date.parse(`${endDate}T00:00:00Z`) / 1000;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?period1=${end - 21 * DAY}&period2=${end + 2 * DAY}&interval=1d`;
  const res = await doFetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Daybook)', accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (res.status === 404) return { error: 'Not found' };
  if (!res.ok) return { error: `Yahoo answered ${res.status}` };
  const data = await res.json();
  const r = data.chart && data.chart.result && data.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) return { error: (data.chart && data.chart.error && data.chart.error.description) || 'No data' };

  const offset = (r.meta && r.meta.gmtoffset) || 0;
  const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const bars = r.timestamp
    .map((t, i) => ({ date: dateOf(t, offset), close: closes[i] }))
    .filter(b => typeof b.close === 'number' && b.close > 0);

  const to = bars.filter(b => b.date <= endDate).pop();
  if (!to) return { error: 'No prices for that week' };
  const weekBefore = dateOf(Date.parse(`${to.date}T00:00:00Z`) / 1000 - 7 * DAY, 0);
  const from = bars.filter(b => b.date <= weekBefore).pop();
  if (!from) return { error: 'Not enough history' };
  return { change: round3((to.close / from.close - 1) * 100), from, to };
}

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const symbols = [...new Set((q.get('symbols') || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean))];
  const end = q.get('end') || '';
  if (!symbols.length || symbols.length > MAX_SYMBOLS || !symbols.every(s => SYMBOL.test(s))) return reply({ error: 'Bad symbols' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(Date.parse(`${end}T00:00:00Z`))) return reply({ error: 'Bad end date' }, 400);

  const results = {};
  await Promise.all(symbols.map(async s => {
    try { results[s] = await weekChange(s, end); } catch { results[s] = { error: 'Could not read prices' }; }
  }));
  return reply({ end, source: 'Yahoo Finance', results });
}
