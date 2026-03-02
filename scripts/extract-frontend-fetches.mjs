import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIR = 'src';
const OUTPUT_FILE = 'docs/generated/frontend-fetches.json';
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeRoute(routeSuffix) {
  let normalized = `/${routeSuffix}`;
  normalized = normalized.replace(/\?.*$/, '');
  normalized = normalized.replace(/\$\{[^}]+\}/g, ':param');
  normalized = normalized.replace(/\/+:param(\/|$)/g, '/:param$1');
  normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

function inferMethod(lines, lineIndex) {
  const currentLine = lines[lineIndex] || '';
  const methodInline = currentLine.match(/method\s*:\s*['"](GET|POST|PATCH|DELETE|PUT)['"]/i);
  if (methodInline) {
    return methodInline[1].toUpperCase();
  }

  const lookahead = lines.slice(lineIndex, Math.min(lineIndex + 12, lines.length)).join(' ');
  const methodNearby = lookahead.match(/method\s*:\s*['"](GET|POST|PATCH|DELETE|PUT)['"]/i);
  if (methodNearby) {
    return methodNearby[1].toUpperCase();
  }

  return 'GET';
}

const files = walk(SOURCE_DIR);
const endpointRegex = /functions\/v1\/make-server-b87b0c07\/([^`"']+)/g;
const entries = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('functions/v1/make-server-b87b0c07/')) {
    continue;
  }
  const lines = source.split('\n');
  endpointRegex.lastIndex = 0;

  let match;
  while ((match = endpointRegex.exec(source)) !== null) {
    const startIndex = match.index;
    const lineNumber = source.slice(0, startIndex).split('\n').length;
    entries.push({
      method: inferMethod(lines, Math.max(0, lineNumber - 1)),
      path: normalizeRoute(match[1]),
      file,
      line: lineNumber,
    });
  }
}

entries.sort((a, b) => {
  if (a.path !== b.path) return a.path.localeCompare(b.path);
  if (a.method !== b.method) return a.method.localeCompare(b.method);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

const payload = {
  generatedAt: new Date().toISOString(),
  sourceDir: SOURCE_DIR,
  occurrenceCount: entries.length,
  uniquePathCount: new Set(entries.map((entry) => entry.path)).size,
  entries,
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${OUTPUT_FILE} with ${payload.occurrenceCount} references (${payload.uniquePathCount} unique paths)`);
