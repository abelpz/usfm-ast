import { StringCursor, CursorOptions, CursorPosition } from './StringCursor';

/**
 * Simple Parser
 *
 * A basic parser class that uses StringCursor for string traversal.
 * Provides a foundation for building specific parsers (like USFM parsers).
 */

export interface ParseOptions extends CursorOptions {
  strict?: boolean;
  debug?: boolean;
}

export interface ParseResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  position?: CursorPosition;
}

export class BaseParser {
  protected cursor: StringCursor;
  protected options: ParseOptions;
  private errors: string[] = [];

  constructor(input: string, options: ParseOptions = {}) {
    this.options = {
      trackPosition: true,
      strict: false,
      debug: false,
      ...options,
    };

    this.cursor = new StringCursor(input, {
      trackPosition: this.options.trackPosition,
      ignoreWhitespace: this.options.ignoreWhitespace,
    });
  }

  /**
   * Parse the input string
   * Override this method in concrete parser implementations
   */
  parse(): ParseResult {
    throw new Error('parse() method must be implemented by subclass');
  }

  /**
   * Get the current cursor position
   */
  getPosition(): CursorPosition {
    return this.cursor.getPosition();
  }

  /**
   * Check if parsing is complete (at end of input)
   */
  isComplete(): boolean {
    return this.cursor.isAtEnd();
  }

  /**
   * Get remaining input from current position
   */
  getRemainingInput(): string {
    return this.cursor.getRemainingInput();
  }

  /**
   * Reset parser to beginning
   */
  reset(): void {
    this.cursor.reset();
    this.errors = [];
  }

  /**
   * Add an error message
   */
  protected addError(message: string): void {
    const position = this.cursor.getPosition();
    const errorMessage = `${message} at line ${position.line}, column ${position.column}`;
    this.errors.push(errorMessage);

    if (this.options.debug) {
      console.warn('Parser Error:', errorMessage);
    }
  }

  /**
   * Get all accumulated errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * Check if parser has any errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Create a successful parse result
   */
  protected createSuccessResult<T>(result: T): ParseResult<T> {
    return {
      success: true,
      result,
      position: this.cursor.getPosition(),
    };
  }

  /**
   * Create a failed parse result
   */
  protected createErrorResult(error: string): ParseResult {
    this.addError(error);
    return {
      success: false,
      error,
      position: this.cursor.getPosition(),
    };
  }

  /**
   * Create a snapshot of current parser state
   */
  protected createSnapshot(): ParserSnapshot {
    return {
      cursorSnapshot: this.cursor.createSnapshot(),
      errorCount: this.errors.length,
    };
  }

  /**
   * Restore parser state from snapshot
   */
  protected restoreSnapshot(snapshot: ParserSnapshot): void {
    this.cursor.restoreSnapshot(snapshot.cursorSnapshot);
    // Remove any errors added after the snapshot
    this.errors = this.errors.slice(0, snapshot.errorCount);
  }

  /**
   * Try to parse with backtracking on failure
   */
  protected tryParse<T>(parseFunction: () => T): T | null {
    const snapshot = this.createSnapshot();
    try {
      return parseFunction();
    } catch (error) {
      this.restoreSnapshot(snapshot);
      return null;
    }
  }
}

export interface ParserSnapshot {
  cursorSnapshot: ReturnType<StringCursor['createSnapshot']>;
  errorCount: number;
}
