import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';
import handler from '../api/checkin.js';

try {
  const contents = await readFile('.env.local', 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
const server = createHttpServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/api/checkin') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8000) { res.writeHead(413).end(); return; } }
    req.body = body;
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
    await handler(req, res);
  } else vite.middlewares(req, res);
});
server.listen(5173, '0.0.0.0', () => console.log('GIEO CLUB: http://localhost:5173 | Demo: http://localhost:5173/?demo=1'));
