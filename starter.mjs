import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const token = process.env.LOCATION_TOKEN;
const arrivalToken = process.env.ARRIVAL_TOKEN;
if (!token || token.length < 24 || !arrivalToken || arrivalToken.length < 24 || token === arrivalToken) {
  throw new Error('Set distinct LOCATION_TOKEN and ARRIVAL_TOKEN values of at least 24 characters.');
}

const page = readFileSync(new URL('./starter.html', import.meta.url));
let latest = null;
let greetingAt = null;
const seen = new Set();

function authorized(request, secret) {
  const actual = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJson(request) {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 4096) throw new Error('Body too large');
  }
  return JSON.parse(body);
}

createServer(async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return response.end(page);
  }

  const route = request.method + ' ' + request.url;
  if (!['GET /api/status', 'POST /api/location', 'POST /api/arrival'].includes(route)) {
    return send(404, { error: 'not_found' });
  }
  if (!authorized(request, route === 'POST /api/arrival' ? arrivalToken : token)) {
    return send(401, { error: 'unauthorized' });
  }
  if (route === 'GET /api/status') {
    return send(200, {
      latest,
      ageSeconds: latest ? Math.floor(Math.max(0, Date.now() - Date.parse(latest.capturedAt)) / 1000) : null,
      greeting: greetingAt ? '到家啦，欢迎回来！' : null,
      greetingAt,
    });
  }

  try {
    const body = await readJson(request);
    const now = Date.now();
    if (route === 'POST /api/location') {
      const { lat, lng, acc, capturedAt } = body;
      const at = Date.parse(capturedAt);
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180
          || !Number.isFinite(acc) || acc < 0 || !Number.isFinite(at)
          || at > now + 60_000 || now - at >= 86_400_000) {
        return send(400, { error: 'invalid_location' });
      }
      if (latest && at <= Date.parse(latest.capturedAt)) return send(409, { error: 'older_location' });
      latest = { lat, lng, acc, capturedAt: new Date(at).toISOString() };
      return send(200, { ok: true });
    }

    const { event, id } = body;
    if (event !== 'arrived_home' || typeof id !== 'string' || !/^[\w.:+-]{1,100}$/.test(id)) {
      return send(400, { error: 'invalid_arrival' });
    }
    if (seen.has(id)) return send(200, { greeted: false, reason: 'duplicate' });
    if (seen.size >= 1000) seen.delete(seen.values().next().value);
    seen.add(id);
    if (greetingAt && now - Date.parse(greetingAt) < 90 * 60_000) {
      return send(200, { greeted: false, reason: 'cooldown' });
    }
    greetingAt = new Date(now).toISOString();
    return send(200, { greeted: true });
  } catch {
    return send(400, { error: 'invalid_body' });
  }
}).listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () => {
  console.log('Location starter listening on loopback.');
});
