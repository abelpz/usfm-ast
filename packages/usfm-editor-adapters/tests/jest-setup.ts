import 'fake-indexeddb/auto';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Load .env.qa from the repo root when running QA integration tests.
// We do a lightweight manual parse (no extra dependency) so unit tests stay
// fast and the file is optional.
// ---------------------------------------------------------------------------
function loadDotEnvFile(filePath: string): void {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return; // file doesn't exist — fine
  }
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    // Don't overwrite values already set in the process environment (CI can
    // inject them directly without a file).
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// __dirname = packages/usfm-editor-adapters/tests  →  ../../../ = repo root
const repoRoot = path.resolve(__dirname, '../../../');
loadDotEnvFile(path.join(repoRoot, '.env.qa'));
