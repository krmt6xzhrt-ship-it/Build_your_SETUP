import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROOT_FILES = new Set([
  'index.html',
  'report.html',
  'report.css',
  'report.js',
  'insights.js',
]);
const SOURCE_ROOTS = [
  path.join(PROJECT_ROOT, 'src'),
  path.join(PROJECT_ROOT, 'build-your-setup', 'src'),
];
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendText(response, statusCode, message, extraHeaders = {}) {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function isInside(filePath, directoryPath) {
  const relative = path.relative(directoryPath, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function decodePathname(requestUrl) {
  try {
    const pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) return null;
    return pathname;
  } catch {
    return null;
  }
}

function safeSourcePath(pathname) {
  if (!pathname.startsWith('/src/')) return null;
  const segments = pathname.slice('/src/'.length).split('/');
  if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    return null;
  }
  return segments.join(path.sep);
}

async function findFile(relativePath, directories) {
  for (const directory of directories) {
    try {
      const [realDirectory, realFile] = await Promise.all([
        realpath(directory),
        realpath(path.resolve(directory, relativePath)),
      ]);
      if (!isInside(realFile, realDirectory)) continue;
      const fileStats = await stat(realFile);
      if (fileStats.isFile()) return { filePath: realFile, size: fileStats.size };
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
    }
  }
  return null;
}

async function resolvePublicFile(pathname) {
  if (pathname === '/') return findFile('index.html', [PROJECT_ROOT]);

  const rootName = pathname.slice(1);
  if (!rootName.includes('/') && ROOT_FILES.has(rootName)) {
    return findFile(rootName, [PROJECT_ROOT]);
  }

  const sourcePath = safeSourcePath(pathname);
  if (sourcePath) return findFile(sourcePath, SOURCE_ROOTS);

  return null;
}

export function createAppServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    const pathname = decodePathname(request.url);
    if (!pathname) {
      sendText(response, 400, 'Bad Request');
      return;
    }

    try {
      const file = await resolvePublicFile(pathname);
      if (!file) {
        sendText(response, 404, 'Not Found');
        return;
      }

      const contentType = MIME_TYPES.get(path.extname(file.filePath).toLowerCase());
      if (!contentType) {
        sendText(response, 404, 'Not Found');
        return;
      }

      response.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': file.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });

      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = createReadStream(file.filePath);
      stream.on('error', () => {
        if (!response.headersSent) sendText(response, 500, 'Internal Server Error');
        else response.destroy();
      });
      stream.pipe(response);
    } catch {
      sendText(response, 500, 'Internal Server Error');
    }
  });
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const host = process.env.HOST || '127.0.0.1';
  const requestedPort = Number(process.env.PORT || 3000);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535
    ? requestedPort
    : 3000;
  const server = createAppServer();

  server.listen(port, host, () => {
    console.log(`Build Your Setup is running at http://${host}:${port}`);
  });
}
