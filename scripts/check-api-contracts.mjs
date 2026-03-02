import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_FILE = 'docs/generated/api-manifest.json';
const FRONTEND_FILE = 'docs/generated/frontend-fetches.json';
const DOCS_FILE = 'docs/generated/docs-endpoints.json';
const REPORT_FILE = 'docs/generated/api-contract-report.md';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function filterLikelyApiPaths(paths) {
  return paths.filter((value) => value.startsWith('/') && value.length > 1);
}

function canonicalize(pathValue) {
  return pathValue.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param');
}

const manifest = readJson(MANIFEST_FILE);
const frontend = readJson(FRONTEND_FILE);
const docs = readJson(DOCS_FILE);

const backendPaths = uniqueSorted(manifest.routes.map((route) => route.path));
const frontendPaths = uniqueSorted(frontend.entries.map((entry) => entry.path));
const docsPaths = uniqueSorted(filterLikelyApiPaths(docs.entries.map((entry) => entry.path)));

const backendCanonicalSet = new Set(backendPaths.map(canonicalize));
const frontendCanonicalSet = new Set(frontendPaths.map(canonicalize));
const docsCanonicalSet = new Set(docsPaths.map(canonicalize));

const frontendMissingInBackend = frontendPaths.filter((route) => !backendCanonicalSet.has(canonicalize(route)));
const backendUnusedByFrontend = backendPaths.filter((route) => !frontendCanonicalSet.has(canonicalize(route)));
const docsMissingInBackend = docsPaths.filter((route) => !backendCanonicalSet.has(canonicalize(route)));
const backendMissingInDocs = backendPaths.filter((route) => !docsCanonicalSet.has(canonicalize(route)));

const status = frontendMissingInBackend.length === 0 && docsMissingInBackend.length === 0 ? 'PASS' : 'WARN';

const reportLines = [
  '# API Contract Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  `- Status: ${status}`,
  `- Backend unique paths: ${backendPaths.length}`,
  `- Frontend unique paths: ${frontendPaths.length}`,
  `- Docs unique paths: ${docsPaths.length}`,
  '',
  '## Frontend Paths Missing In Backend',
  '',
  ...(frontendMissingInBackend.length ? frontendMissingInBackend.map((route) => `- ${route}`) : ['- None']),
  '',
  '## Docs Paths Missing In Backend',
  '',
  ...(docsMissingInBackend.length ? docsMissingInBackend.map((route) => `- ${route}`) : ['- None']),
  '',
  '## Backend Paths Not Used By Frontend',
  '',
  ...(backendUnusedByFrontend.length ? backendUnusedByFrontend.map((route) => `- ${route}`) : ['- None']),
  '',
  '## Backend Paths Missing In Docs',
  '',
  ...(backendMissingInDocs.length ? backendMissingInDocs.map((route) => `- ${route}`) : ['- None']),
  '',
  '> This check is non-blocking by default. Use `--strict` to exit with code 1 on WARN.',
  '',
];

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, reportLines.join('\n'));

console.log(`Wrote ${REPORT_FILE}`);
console.log(`Status: ${status}`);
console.log(`frontendMissingInBackend=${frontendMissingInBackend.length}`);
console.log(`docsMissingInBackend=${docsMissingInBackend.length}`);

const strict = process.argv.includes('--strict');
if (strict && status !== 'PASS') {
  process.exit(1);
}
