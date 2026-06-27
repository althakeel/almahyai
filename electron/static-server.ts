import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function startStaticServer(root: string): Promise<{ server: http.Server; port: number }> {
  const normalizedRoot = path.normalize(root);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let filePath = path.normalize(path.join(normalizedRoot, urlPath === '/' ? 'index.html' : urlPath));

      if (!filePath.startsWith(normalizedRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          filePath = path.join(normalizedRoot, 'index.html');
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.listen(0, 'localhost', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error('Failed to start local static server'));
      }
    });
  });
}
