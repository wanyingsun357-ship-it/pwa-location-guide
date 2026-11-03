import assert from 'node:assert/strict';

const home = { lat: 0, lng: 0 };
const cooldown = 90 * 60_000;
const maxAge = 24 * 60 * 60_000;

function distance(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const h = Math.sin(rad(a.lat - b.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat))
    * Math.sin(rad(a.lng - b.lng) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function arrival(previous, latest, lastGreeting, now) {
  if (!previous || latest.at <= previous.at || now - latest.at >= maxAge) return false;
  return distance(previous, home) > 400
    && distance(latest, home) <= 200
    && (lastGreeting == null || now - lastGreeting >= cooldown);
}

const now = Date.UTC(2026, 0, 1, 12);
const outside = { lat: 0.006, lng: 0, at: now - 60_000 };
const buffer = { lat: 0.003, lng: 0, at: now - 30_000 };
const inside = { lat: 0.001, lng: 0, at: now };

assert.equal(arrival(outside, inside, null, now), true);
assert.equal(arrival(outside, inside, now - 60_000, now), false);
assert.equal(arrival(null, inside, null, now), false);
assert.equal(arrival(buffer, inside, null, now), false);
assert.equal(arrival(outside, inside, null, now + maxAge), false);
console.log('五个到家场景通过。所有位置与时间均为本地模拟。');
