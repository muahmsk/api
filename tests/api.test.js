import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, PresenceEngine, RateLimiter } from '../src/server.js';

function createRequest(url, method = 'GET', body = null, ip = '127.0.0.1') {
  const headers = { 'Content-Type': 'application/json', 'cf-connecting-ip': ip };
  const options = { method, headers };
  if (body !== null) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(url, options);
}

test('TEST 1: Ahmet join eder -> listede Ahmet görünür', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  const joinRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter
  );
  assert.equal(joinRes.status, 200);
  const joinData = await joinRes.json();
  assert.equal(joinData.ok, true);

  const listRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter
  );
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.deepEqual(listData.players, ['Ahmet']);
});

test('TEST 2: Mehmet aynı serverId ile join eder -> listede Ahmet + Mehmet görünür', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter
  );

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Mehmet',
      serverId: 'server-alpha',
      sessionId: 'sess-2'
    }),
    engine,
    limiter
  );

  const listRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter
  );
  const listData = await listRes.json();
  assert.deepEqual(listData.players.sort(), ['Ahmet', 'Mehmet']);
});

test('TEST 3: Mehmet farklı serverId ile join eder -> Ahmetin server listesinde Mehmet görünmez', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter
  );

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Mehmet',
      serverId: 'server-beta',
      sessionId: 'sess-2'
    }),
    engine,
    limiter
  );

  const listRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter
  );
  const listData = await listRes.json();
  assert.deepEqual(listData.players, ['Ahmet']);
  assert.equal(listData.players.includes('Mehmet'), false);
});

test('TEST 4: Ahmet heartbeat göndermez -> TTL (60s) sonrası Ahmet aktif listeden düşer', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  const t0 = 1_000_000;
  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter,
    t0
  );

  // Still active at t0 + 30s
  const activeRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter,
    t0 + 30_000
  );
  assert.deepEqual((await activeRes.json()).players, ['Ahmet']);

  // Expired at t0 + 61s (>60s TTL)
  const expiredRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter,
    t0 + 61_000
  );
  assert.deepEqual((await expiredRes.json()).players, []);
});

test('TEST 5: Ahmet leave gönderir -> Ahmet hemen listeden çıkar', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter
  );

  const leaveRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/leave', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-1'
    }),
    engine,
    limiter
  );
  assert.equal(leaveRes.status, 200);

  const listRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter
  );
  assert.deepEqual((await listRes.json()).players, []);
});

test('TEST 6: Aynı nickname ile iki farklı session gelir -> sessionId sayesinde kayıtlar birbirine karışmaz', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-device-1'
    }),
    engine,
    limiter
  );

  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-device-2'
    }),
    engine,
    limiter
  );

  // Leave first session
  await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/leave', 'POST', {
      nickname: 'Ahmet',
      serverId: 'server-alpha',
      sessionId: 'sess-device-1'
    }),
    engine,
    limiter
  );

  // Ahmet is still active via device 2
  const listRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET'),
    engine,
    limiter
  );
  assert.deepEqual((await listRes.json()).players, ['Ahmet']);
});

test('TEST 7: Geçersiz JSON -> API crash olmaz, 400 Bad Request döner', async () => {
  const engine = new PresenceEngine();
  const limiter = new RateLimiter(100, 60_000);

  const badRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/join', 'POST', '{ malformed json: true'),
    engine,
    limiter
  );
  assert.equal(badRes.status, 400);
  const data = await badRes.json();
  assert.equal(data.code, 400);
});

test('TEST 8: Rate limit -> Aşırı istekler 429 Too Many Requests ile sınırlandırılır', async () => {
  const engine = new PresenceEngine();
  const strictLimiter = new RateLimiter(3, 60_000); // Allow max 3 requests

  const ip = '198.51.100.42';
  for (let i = 0; i < 3; i++) {
    const res = await handleRequest(
      createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET', null, ip),
      engine,
      strictLimiter
    );
    assert.equal(res.status, 200);
  }

  // 4th request should be rate limited
  const blockedRes = await handleRequest(
    createRequest('https://api.normtag.internal/v1/presence/list?serverId=server-alpha', 'GET', null, ip),
    engine,
    strictLimiter
  );
  assert.equal(blockedRes.status, 429);
  const blockedData = await blockedRes.json();
  assert.equal(blockedData.code, 429);
});
