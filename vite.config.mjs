import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(rootDir, 'public/assets/data');
const animationDir = path.resolve(rootDir, 'public/assets/animations');

export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'index.html'),
        export: path.resolve(rootDir, 'export.html'),
      },
    },
  },
  plugins: [
    {
      name: 'scene-json-writer',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
          const target = getWritableJsonTarget(requestUrl.pathname);
          if (target === undefined) {
            next();
            return;
          }

          if (target === null) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid scene config target' }));
            return;
          }

          if (req.method !== 'POST' && req.method !== 'DELETE') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          try {
            if (req.method === 'DELETE') {
              await rm(target, { force: true });
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            const body = await readRequestBody(req);
            const parsed = JSON.parse(body);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }));
          }
        });
      },
    },
  ],
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1000000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getWritableJsonTarget(pathname) {
  const sceneMatch = /^\/__editor\/scenes\/([^/]+)\/(config|editor-config)$/.exec(pathname);
  if (sceneMatch) {
    const sceneId = parseSceneId(sceneMatch[1]);
    if (sceneId === null) {
      return null;
    }

    const suffix = sceneMatch[2] === 'editor-config' ? '.editor.json' : '.json';
    return resolveJsonTarget(dataDir, `${sceneId}${suffix}`);
  }

  const animationMatch = /^\/__editor\/animations\/([^/]+)\/clips$/.exec(pathname);
  if (animationMatch) {
    const sceneId = parseSceneId(animationMatch[1]);
    if (sceneId === null) {
      return null;
    }

    return resolveJsonTarget(animationDir, `${sceneId}.animation.json`);
  }

  const timelineMatch = /^\/__editor\/animations\/([^/]+)\/timeline$/.exec(pathname);
  if (timelineMatch) {
    const sceneId = parseSceneId(timelineMatch[1]);
    if (sceneId === null) {
      return null;
    }

    return resolveJsonTarget(animationDir, `${sceneId}.timeline.json`);
  }

  if (pathname === '/__editor/config') {
    return resolveJsonTarget(dataDir, 'editor.json');
  }

  const assetDataMatch = /^\/__editor\/assets\/data\/([a-z0-9][a-z0-9-]*\.json)$/.exec(pathname);
  if (assetDataMatch) {
    return resolveJsonTarget(dataDir, assetDataMatch[1]);
  }

  return undefined;
}

function parseSceneId(encodedSceneId) {
  let sceneId = '';
  try {
    sceneId = decodeURIComponent(encodedSceneId);
  } catch {
    return null;
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(sceneId)) {
    return null;
  }

  return sceneId;
}

function resolveJsonTarget(baseDir, fileName) {
  const target = path.resolve(baseDir, fileName);

  if (!target.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return target;
}
