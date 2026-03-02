import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_FILE = 'docs/generated/docs-endpoints.json';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'generated']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...walk(fullPath));
      }
      continue;
    }

    if (entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalize(route) {
  let normalized = route.trim();
  normalized = normalized.replace(/^`+|`+$/g, '');
  normalized = normalized.replace(/^\/make-server-b87b0c07\//, '/');
  normalized = normalized.replace(/^make-server-b87b0c07\//, '/');
  normalized = normalized.replace(/\?.*$/, '');
  normalized = normalized.replace(/[),.;:]+$/, '');
  normalized = normalized.replace(/\/+$/, '');
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized;
}

function looksLikeApiPath(route) {
  if (!route || route === '/') return false;
  if (route.includes('.')) return false;
  if (/^\/(src|docs|supabase|utils|dist)\b/.test(route)) return false;
  return true;
}

const files = walk('.');
const entries = [];

const prefixedRegex = /make-server-b87b0c07\/([A-Za-z0-9_:/?=&.-]+)/g;
const methodRouteRegex = /(?:GET|POST|PATCH|DELETE|PUT)\s+`?(\/[-A-Za-z0-9_:/.]+)`?/g;
const tableRouteRegex = /\|\s*`?(\/[-A-Za-z0-9_:.\/]+)`?\s*\|\s*(GET|POST|PATCH|DELETE|PUT)\b/gi;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    prefixedRegex.lastIndex = 0;
    let match;
    while ((match = prefixedRegex.exec(line)) !== null) {
      const route = normalize(match[1]);
      if (looksLikeApiPath(route)) {
        entries.push({ file, line: i + 1, path: route, pattern: 'prefixed' });
      }
    }

    methodRouteRegex.lastIndex = 0;
    while ((match = methodRouteRegex.exec(line)) !== null) {
      const route = normalize(match[1]);
      if (looksLikeApiPath(route)) {
        entries.push({ file, line: i + 1, path: route, pattern: 'method-route' });
      }
    }

    tableRouteRegex.lastIndex = 0;
    while ((match = tableRouteRegex.exec(line)) !== null) {
      const route = normalize(match[1]);
      if (looksLikeApiPath(route)) {
        entries.push({ file, line: i + 1, path: route, pattern: 'table-route' });
      }
    }
  }
}

entries.sort((a, b) => {
  if (a.path !== b.path) return a.path.localeCompare(b.path);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

const payload = {
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  occurrenceCount: entries.length,
  uniquePathCount: new Set(entries.map((entry) => entry.path)).size,
  entries,
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${OUTPUT_FILE} with ${payload.occurrenceCount} references (${payload.uniquePathCount} unique paths)`);
