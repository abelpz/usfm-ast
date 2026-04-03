import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace('/src/main.ts', './main.js');
html = html.replace(
  '</head>',
  '    <link rel="stylesheet" href="./main.css" />\n  </head>'
);
writeFileSync(join(dist, 'index.html'), html);
