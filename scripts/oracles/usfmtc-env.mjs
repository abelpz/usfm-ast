/**
 * Resolve Python and run usfmtc_dump.py. Tries several interpreters (see
 * listPythonInvokers) so a stray `python` on PATH (e.g. Inkscape on Windows)
 * does not block a real Python install. If `usfmtc` is not installed, runs
 * `pip install -r scripts/oracles/requirements.txt` for that interpreter once
 * unless ORACLE_SKIP_USFMTC_PIP=1.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const USFMTC_REQUIREMENTS = join(__dirname, 'requirements.txt');

function combinedErr(result) {
  return [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
}

function isMissingUsfmtcModule(errText) {
  return (
    /No module named ['"]usfmtc['"]/.test(errText) ||
    /ModuleNotFoundError:[^\n]*usfmtc/.test(errText)
  );
}

function isNoPip(errText) {
  return /No module named ['"]pip['"]/.test(errText) || /No module named pip/.test(errText);
}

/** Broken interpreter path, uninstalled Python, or Windows Store stub — try next candidate. */
function isRetryablePythonFailure(errText) {
  return (
    /Unable to create process/i.test(errText) ||
    /cannot find the file specified/i.test(errText) ||
    /Python was not found/i.test(errText) ||
    /No installed Python found/i.test(errText)
  );
}

/** @typedef {{ cmd: string, prefix: string[] }} PythonInvoker */

/**
 * Order: PYTHON, PYTHON3, lowercase `python` env (some shells export $python),
 * then `python3`, then `python` on PATH. Does not use the Windows `py` launcher.
 * @returns {PythonInvoker[]}
 */
function listPythonInvokers() {
  /** @type {PythonInvoker[]} */
  const out = [];
  const seen = new Set();
  /** @param {string} cmd @param {string[]} prefix */
  function add(cmd, prefix) {
    const key = `${cmd}\0${prefix.join('\n')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ cmd, prefix });
  }
  if (process.env.PYTHON) add(process.env.PYTHON, []);
  if (process.env.PYTHON3) add(process.env.PYTHON3, []);
  if (process.env.python) add(process.env.python, []);
  add('python3', []);
  add('python', []);
  return out;
}

/**
 * @param {PythonInvoker} inv
 * @param {string} cwd
 */
function runPipInstallUsfmtc(inv, cwd) {
  return spawnSync(
    inv.cmd,
    [...inv.prefix, '-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-r', USFMTC_REQUIREMENTS],
    { encoding: 'utf-8', cwd }
  );
}

/**
 * @param {PythonInvoker} inv
 * @param {string} scriptPath
 * @param {string} absUsfm
 * @param {string} usjPath
 * @param {string} usxPath
 * @param {string} cwd
 */
function runDump(inv, scriptPath, absUsfm, usjPath, usxPath, cwd) {
  return spawnSync(inv.cmd, [...inv.prefix, scriptPath, absUsfm, usjPath, usxPath], {
    encoding: 'utf-8',
    cwd,
  });
}

/**
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 */
function isExecutableMissing(result) {
  return Boolean(result.error && result.error.code === 'ENOENT');
}

/**
 * @param {string} scriptPath
 * @param {string} absUsfm
 * @param {string} usjPath
 * @param {string} usxPath
 * @param {string} cwd
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
export function spawnUsfmtcDump(scriptPath, absUsfm, usjPath, usxPath, cwd) {
  const invokers = listPythonInvokers();
  /** @type {import('node:child_process').SpawnSyncReturns<string> | null} */
  let last = null;

  for (const inv of invokers) {
    let result = runDump(inv, scriptPath, absUsfm, usjPath, usxPath, cwd);
    last = result;

    if (result.status === 0) return result;
    if (isExecutableMissing(result)) continue;

    const errText = combinedErr(result);
    if (isRetryablePythonFailure(errText)) continue;
    if (!isMissingUsfmtcModule(errText)) {
      return result;
    }
    if (process.env.ORACLE_SKIP_USFMTC_PIP === '1') {
      last = result;
      continue;
    }

    console.warn(
      '[usfmtc] installing Python dependencies (scripts/oracles/requirements.txt). Set ORACLE_SKIP_USFMTC_PIP=1 to skip.'
    );
    const pip = runPipInstallUsfmtc(inv, cwd);
    const pipErr = combinedErr(pip);
    if (pip.status !== 0) {
      if (pipErr) {
        if (isNoPip(pipErr)) {
          console.warn(
            `[usfmtc] ${inv.cmd} has no pip; trying next Python (set PYTHON to a full python.exe if installs keep failing).`
          );
        } else {
          console.warn('[usfmtc] pip install failed:\n', pipErr.slice(0, 800));
        }
      }
      last = result;
      continue;
    }

    result = runDump(inv, scriptPath, absUsfm, usjPath, usxPath, cwd);
    last = result;
    if (result.status === 0) return result;

    const err2 = combinedErr(result);
    if (isExecutableMissing(result)) continue;
    if (isRetryablePythonFailure(err2)) continue;
    if (!isMissingUsfmtcModule(err2)) return result;
  }

  return last ?? { status: 1, stderr: 'no Python interpreter found', stdout: '', error: undefined };
}
