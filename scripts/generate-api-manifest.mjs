import fs from 'node:fs';
import path from 'node:path';

const BACKEND_FILE = 'supabase/functions/make-server-b87b0c07/index.ts';
const OUTPUT_FILE = 'docs/generated/api-manifest.json';

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const source = fs.readFileSync(BACKEND_FILE, 'utf8');
const lines = source.split('\n');
const routeRegex = /app\.(get|post|patch|delete)\(["']\/make-server-b87b0c07\/([^"']+)["']/g;

const routes = [];
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  routeRegex.lastIndex = 0;
  let match;
  while ((match = routeRegex.exec(line)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = `/${match[2]}`;
    routes.push({
      method,
      path: routePath,
      line: i + 1,
      source: BACKEND_FILE,
    });
  }
}

routes.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

const payload = {
  generatedAt: new Date().toISOString(),
  source: BACKEND_FILE,
  routeCount: routes.length,
  uniquePathCount: new Set(routes.map((route) => route.path)).size,
  routes,
};

ensureDirFor(OUTPUT_FILE);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${OUTPUT_FILE} with ${payload.routeCount} routes (${payload.uniquePathCount} unique paths)`);
