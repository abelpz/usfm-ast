import { PTXPRINT_MISSING_PDF_CODE } from './books/paratextNumber';

export class PtxprintNotFoundError extends Error {
  override readonly name = 'PtxprintNotFoundError';
  constructor(message?: string) {
    super(
      message ??
        'PTXprint CLI not found. Install from https://software.sil.org/ptxprint/ and ensure `ptxprint` is on PATH, or set PTXPRINT_BIN.',
    );
  }
}

export class PtxprintExitError extends Error {
  override readonly name = 'PtxprintExitError';
  constructor(
    public readonly code: number,
    public readonly log: string,
    public readonly tempDir: string,
  ) {
    super(
      code === PTXPRINT_MISSING_PDF_CODE
        ? 'PTXprint finished but the expected PDF file was not found'
        : `PTXprint exited with code ${code}`,
    );
  }
}

export class ScriptureNormalizeError extends Error {
  override readonly name = 'ScriptureNormalizeError';
  constructor(message?: string) {
    super(message ?? 'Failed to normalize scripture input');
  }
}

export class BookIdMismatchError extends Error {
  override readonly name = 'BookIdMismatchError';
  constructor(message?: string) {
    super(message ?? 'Book id mismatch');
  }
}
