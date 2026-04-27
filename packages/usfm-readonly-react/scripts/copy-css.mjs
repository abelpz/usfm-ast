import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src', 'default.css');
const dest = join(root, 'dist', 'default.css');
if (!existsSync(join(root, 'dist'))) mkdirSync(join(root, 'dist'), { recursive: true });
copyFileSync(src, dest);
