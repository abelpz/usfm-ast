import { spawn } from 'child_process';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';

import { PTXPRINT_MISSING_PDF_CODE } from '../books/paratextNumber';
import { PtxprintExitError } from '../errors';

import { expectedPdfPath } from './pdfPath';

const DEFAULT_TIMEOUT_MS = 600_000;

const XETEX_LOG_TAIL = 8000;

async function readXetexLog(opts: {
  projectsRoot: string;
  projectId: string;
  configId: string;
  bookCode: string;
}): Promise<string | null> {
  const logPath = join(
    opts.projectsRoot,
    opts.projectId,
    'local',
    'ptxprint',
    opts.configId,
    `${opts.projectId}_${opts.configId}_${opts.bookCode}_ptxp.log`,
  );
  try {
    const txt = await readFile(logPath, 'utf8');
    const tail =
      txt.length > XETEX_LOG_TAIL ? `…\n${txt.slice(-XETEX_LOG_TAIL)}` : txt;
    return `\n--- xetex log (${logPath}) ---\n${tail}`;
  } catch {
    return null;
  }
}

export interface RunPtxprintOptions {
  bin: string;
  projectsRoot: string;
  projectId: string;
  /** Primary book code (used for the `-b` CLI flag). For multi-book jobs pass the first book. */
  bookCode: string;
  /** All book codes in the job, used to compute the expected PDF filename. Defaults to [bookCode]. */
  bookCodes?: string[];
  configId: string;
  /** Root temp folder (parent of `projectsRoot`) for cleanup / diagnostics. */
  workspaceTempDir: string;
  /**
   * Pages per physical spread (from `RenderOptions.pagesPerSpread`).
   * When > 1, PTXprint's finishing step writes an imposed `_<N>up.pdf` file;
   * we must look for that suffixed filename instead of the plain base PDF.
   */
  pagesPerSpread?: number;

  // ── PTXprint CLI pass-through ──────────────────────────────────────────
  /** Font search directories — `-f <dir>` (repeatable). */
  fontPaths?: string[];
  /** PDF version — `-V <n>` (e.g. 14 = PDF 1.4). */
  pdfVersion?: number;
  /** XeTeX-level timeout in seconds — `--timeout <n>`. */
  xetexTimeoutSec?: number;
  /** Max XeTeX re-runs — `-R <n>`. */
  xetexRuns?: number;
  /** Suppress splash / limit output — `-q`. */
  quiet?: boolean;
  /** Disable internet access — `-N`. */
  noInternet?: boolean;
  /** UI component=value overrides — `-D <k=v>` (repeatable). */
  ptxDefine?: Record<string, string>;
  /** Enable debug output — `--debug`. */
  debugMode?: boolean;
  /** Logging level — `-l <level>`. */
  logLevel?: string;
  /** Log file path — `--logfile <path>`. */
  logFile?: string;
  /** TeX macros directory — `-m <dir>`. */
  macrosDir?: string;
  /** Special flags string — `-z <flags>`. */
  extras?: string;

  // ── Node / process ────────────────────────────────────────────────────
  onLog?: (chunk: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  keepTempDir?: boolean;
}

export async function runPtxprint(opts: RunPtxprintOptions): Promise<{ pdf: Buffer; log: string }> {
  const {
    bin,
    projectsRoot,
    projectId,
    bookCode,
    bookCodes,
    configId,
    workspaceTempDir,
    pagesPerSpread,
    fontPaths,
    pdfVersion,
    xetexTimeoutSec,
    xetexRuns,
    quiet,
    noInternet,
    ptxDefine,
    debugMode,
    logLevel,
    logFile,
    macrosDir,
    extras,
    onLog,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    keepTempDir = false,
  } = opts;

  if (signal?.aborted) {
    throw new Error('PTXprint run aborted');
  }

  // PTXprint's -b flag accepts a space-separated list and sets ecb_booklist + r_book=multiple.
  // For multi-book jobs we pass all codes so baseTeXPDFnames produces "JHN-GEN" (first-last).
  const booksArg = bookCodes && bookCodes.length > 1 ? bookCodes.join(' ') : bookCode;

  const args = ['-p', projectsRoot, '-c', configId, '-b', booksArg, '-P', projectId];

  // ── PTXprint CLI pass-through flags ─────────────────────────────────────
  if (fontPaths)        for (const fp of fontPaths) args.push('-f', fp);
  if (pdfVersion != null)        args.push('-V', String(pdfVersion));
  if (xetexTimeoutSec != null)   args.push('--timeout', String(xetexTimeoutSec));
  if (xetexRuns != null)         args.push('-R', String(xetexRuns));
  if (quiet)                     args.push('-q');
  if (noInternet)                args.push('-N');
  if (ptxDefine)        for (const [k, v] of Object.entries(ptxDefine)) args.push('-D', `${k}=${v}`);
  if (debugMode)                 args.push('--debug');
  if (logLevel)                  args.push('-l', logLevel);
  if (logFile)                   args.push('--logfile', logFile);
  if (macrosDir)                 args.push('-m', macrosDir);
  if (extras)                    args.push('-z', extras);

  let log = '';
  const append = (chunk: Buffer) => {
    const s = chunk.toString();
    log += s;
    onLog?.(s);
  };

  let exitCode: number | undefined;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    const child = spawn(bin, args, {
      windowsHide: true,
      env: process.env,
    });

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    const kill = (): void => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    };

    const onAbort = (): void => {
      kill();
      settle(() => reject(new Error('PTXprint run aborted')));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      kill();
      settle(() => reject(new Error(`PTXprint timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      settle(() => reject(err));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      exitCode = code ?? -1;
      settle(() => resolve());
    });
  });

  if (exitCode !== undefined && exitCode !== 0) {
    const tail = await readXetexLog({ projectsRoot, projectId, configId, bookCode });
    throw new PtxprintExitError(exitCode, tail ? log + tail : log, workspaceTempDir);
  }

  const pdfPath = expectedPdfPath({
    projectsRoot,
    projectId,
    configId,
    bookCode: bookCodes ?? bookCode,
    pagesPerSpread,
  });

  let pdf: Buffer;
  try {
    pdf = await readFile(pdfPath);
  } catch {
    const tail = await readXetexLog({ projectsRoot, projectId, configId, bookCode });
    throw new PtxprintExitError(
      PTXPRINT_MISSING_PDF_CODE,
      `${log}${tail ?? ''}\n(expected PDF at ${pdfPath})`,
      workspaceTempDir,
    );
  }

  if (!keepTempDir) {
    try {
      await rm(workspaceTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  return { pdf, log };
}
