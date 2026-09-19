/**
 * NormTag Presence API - Cloudflare Worker Entrypoint
 * Uses Cloudflare Durable Objects with SQLite storage
 */

import { handleRequest, PresenceEngine, RateLimiter } from './server.js';

export class PresenceRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.engine = new PresenceEngine();
  }

  async fetch(request) {
    return handleRequest(request, this.engine, new RateLimiter(1000, 60_000));
  }
}

const globalRateLimiter = new RateLimiter(120, 60_000);
const standaloneEngine = new PresenceEngine();

export default {
  async fetch(request, env, ctx) {
    // If running with Durable Objects binding
    if (env && env.PRESENCE_ROOMS) {
      const url = new URL(request.url);
      let serverId = url.searchParams.get('serverId');

      if (request.method === 'POST') {
        const cloned = request.clone();
        try {
          const body = await cloned.json();
          serverId = body.serverId;
        } catch {
          // fallback to standard handler for error response
        }
      }

      if (serverId) {
        const id = env.PRESENCE_ROOMS.idFromName(serverId);
        const room = env.PRESENCE_ROOMS.get(id);
        return room.fetch(request);
      }
    }

    // Default standalone handler
    return handleRequest(request, standaloneEngine, globalRateLimiter);
  }
};
