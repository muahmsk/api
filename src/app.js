/**
 * Standalone HTTP Server for NormTag Presence API
 * Runs on Node.js 18+ with zero external dependencies.
 * Compatible with Render, Koyeb, Railway, Fly.io, VPS.
 */
import http from 'node:http';
import { handleRequest } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

const server = http.createServer(async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${PORT}`;
    const url = `${protocol}://${host}${req.url}`;

    // Read request body if present
    let body = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body && body.length > 0 ? body : undefined
    });

    const webResponse = await handleRequest(webRequest);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const resBody = await webResponse.arrayBuffer();
    res.end(Buffer.from(resBody));
  } catch (err) {
    console.error('Error handling request:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error', code: 500 }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[NormTag Presence API] Server listening on http://${HOST}:${PORT}`);
});
