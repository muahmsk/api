/**
 * NormTag Presence API - Core Server & Room Logic
 * Production-ready for Cloudflare Workers & Durable Objects
 */

const TTL_MILLISECONDS = 60_000; // 60 seconds stale expiration
const MAX_NICKNAME_LENGTH = 32;
const MAX_SERVER_ID_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 128;

export class PresenceEngine {
  constructor() {
    // Map<serverId, Map<sessionId, { nickname: string, lastSeen: number }>>
    this.rooms = new Map();
  }

  join(serverId, sessionId, nickname, now = Date.now()) {
    if (!this.rooms.has(serverId)) {
      this.rooms.set(serverId, new Map());
    }
    const room = this.rooms.get(serverId);
    room.set(sessionId, {
      nickname: String(nickname),
      lastSeen: now
    });
    return { ok: true };
  }

  heartbeat(serverId, sessionId, nickname, now = Date.now()) {
    if (!this.rooms.has(serverId)) {
      this.rooms.set(serverId, new Map());
    }
    const room = this.rooms.get(serverId);
    const existing = room.get(sessionId);
    room.set(sessionId, {
      nickname: existing ? existing.nickname : String(nickname),
      lastSeen: now
    });
    return { ok: true };
  }

  leave(serverId, sessionId) {
    if (this.rooms.has(serverId)) {
      const room = this.rooms.get(serverId);
      room.delete(sessionId);
      if (room.size === 0) {
        this.rooms.delete(serverId);
      }
    }
    return { ok: true };
  }

  list(serverId, now = Date.now()) {
    if (!this.rooms.has(serverId)) {
      return { players: [] };
    }
    const room = this.rooms.get(serverId);
    const activeNicknames = new Set();

    for (const [sessionId, session] of room.entries()) {
      if (now - session.lastSeen <= TTL_MILLISECONDS) {
        activeNicknames.add(session.nickname);
      } else {
        // Opportunistic cleanup of stale entries
        room.delete(sessionId);
      }
    }

    if (room.size === 0) {
      this.rooms.delete(serverId);
    }

    return { players: Array.from(activeNicknames).sort() };
  }
}

export class RateLimiter {
  constructor(limit = 120, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.clients = new Map();
  }

  isAllowed(ip, now = Date.now()) {
    if (!ip) return true;
    let record = this.clients.get(ip);
    if (!record || now - record.startTime > this.windowMs) {
      record = { count: 1, startTime: now };
      this.clients.set(ip, record);
      return true;
    }

    record.count++;
    if (record.count > this.limit) {
      return false;
    }
    return true;
  }
}

export const defaultEngine = new PresenceEngine();
export const defaultRateLimiter = new RateLimiter(120, 60_000);

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    }
  });
}

export async function handleRequest(request, engine = defaultEngine, rateLimiter = defaultRateLimiter, now = Date.now()) {
  const url = new URL(request.url);

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Rate Limiting
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!rateLimiter.isAllowed(clientIp, now)) {
    return jsonResponse({ error: 'Too Many Requests', code: 429 }, 429);
  }

  // Router
  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
    return jsonResponse({ status: 'ok', service: 'normtag-presence-api', timestamp: now }, 200);
  }

  if (request.method === 'GET' && (url.pathname === '/v1/presence/list' || url.pathname === '/presence/list')) {
    const serverId = url.searchParams.get('serverId');
    if (!serverId || typeof serverId !== 'string' || serverId.trim().length === 0) {
      return jsonResponse({ error: 'Missing or invalid serverId', code: 400 }, 400);
    }
    return jsonResponse(engine.list(serverId.trim(), now), 200);
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload', code: 400 }, 400);
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Body must be an object', code: 400 }, 400);
    }

    const { nickname, serverId, sessionId } = body;

    if (!serverId || typeof serverId !== 'string' || serverId.length > MAX_SERVER_ID_LENGTH) {
      return jsonResponse({ error: 'Invalid serverId', code: 400 }, 400);
    }
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > MAX_SESSION_ID_LENGTH) {
      return jsonResponse({ error: 'Invalid sessionId', code: 400 }, 400);
    }

    if (url.pathname === '/v1/presence/join' || url.pathname === '/presence/join') {
      if (!nickname || typeof nickname !== 'string' || nickname.length > MAX_NICKNAME_LENGTH) {
        return jsonResponse({ error: 'Invalid nickname', code: 400 }, 400);
      }
      return jsonResponse(engine.join(serverId, sessionId, nickname, now), 200);
    }

    if (url.pathname === '/v1/presence/heartbeat' || url.pathname === '/presence/heartbeat') {
      if (!nickname || typeof nickname !== 'string' || nickname.length > MAX_NICKNAME_LENGTH) {
        return jsonResponse({ error: 'Invalid nickname', code: 400 }, 400);
      }
      return jsonResponse(engine.heartbeat(serverId, sessionId, nickname, now), 200);
    }

    if (url.pathname === '/v1/presence/leave' || url.pathname === '/presence/leave') {
      return jsonResponse(engine.leave(serverId, sessionId), 200);
    }

    return jsonResponse({ error: 'Not Found', code: 404 }, 404);
  }

  return jsonResponse({ error: 'Method Not Allowed', code: 405 }, 405);
}
