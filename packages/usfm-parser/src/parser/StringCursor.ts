/**
 * String Cursor
 *
 * A utility class for traversing string input character by character.
 * Designed to be used as a foundation tool by parsers for USFM and other text-based formats.
 */

export interface CursorPosition {
  line: number;
  column: number;
  index: number;
}

export interface CursorOptions {
  trackPosition?: boolean;
  ignoreWhitespace?: boolean;
  ignoredChars?: string[];
  debug?: boolean;
}

export class StringCursor {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private options: CursorOptions;
  private ignoredChars: string[];

  // Current character (always updated - lightweight)
  public currentChar: string | null = null;

  // Debug properties (only updated when debug mode is enabled)
  public remainingText: string = '';
  public processedText: string = '';

  constructor(input: string, options: CursorOptions = {}) {
    this.input = input;
    this.options = {
      trackPosition: true,
      ignoreWhitespace: false,
      ignoredChars: [],
      debug: false,
      ...options,
    };
    this.ignoredChars = this.options.ignoredChars || [];

    // Initialize current state
    this.updateCurrentState();
  }

  /**
   * Update current character and debugging text slices (if debug mode is enabled)
   */
  private updateCurrentState(): void {
    // Always update current character (lightweight operation)
    let pos = this.position;
    while (pos < this.input.length && this.shouldIgnoreChar(this.input[pos])) {
      pos++;
    }
    this.currentChar = pos >= this.input.length ? null : this.input[pos];

    // Only update text slices in debug mode to avoid performance overhead
    if (this.options.debug) {
      this.processedText = this.input.substring(0, this.position);
      this.remainingText = this.input.substring(this.position);
    }
  }

  /**
   * Get the current character without advancing position
   */
  peek(offset: number = 0): string | null {
    let pos = this.position + offset;
    if (pos >= this.input.length) {
      return null;
    }

    // Skip ignored characters to show what next() would return
    while (pos < this.input.length && this.shouldIgnoreChar(this.input[pos])) {
      pos++;
    }

    if (pos >= this.input.length) {
      return null;
    }

    return this.input[pos];
  }

  /**
   * Get the current character and advance position
   */
  next(): string | null {
    if (this.isAtEnd()) {
      return null;
    }

    const char = this.input[this.position];
    this.advance();
    return char;
  }

  /**
   * Advance the position by one character, automatically skipping ignored characters
   */
  advance(): void {
    if (this.isAtEnd()) {
      return;
    }

    // Move position and update line/column tracking for the current character
    if (this.options.trackPosition) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
    }

    this.position++;

    // Skip ignored characters, but still count them for position tracking
    while (!this.isAtEnd() && this.shouldIgnoreChar(this.input[this.position])) {
      if (this.options.trackPosition) {
        if (this.input[this.position] === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
      }
      this.position++;
    }

    // Update debugging properties after advancing
    this.updateCurrentState();
  }

  /**
   * Move back one character, skipping over ignored characters
   */
  back(): void {
    if (this.position <= 0) {
      return;
    }

    // Move back one position
    this.position--;

    // Skip back over ignored characters
    while (this.position > 0 && this.shouldIgnoreChar(this.input[this.position])) {
      this.position--;
    }

    // Recalculate position tracking when moving backwards
    if (this.options.trackPosition) {
      this.recalculatePosition(this.position);
    }

    // Update debugging properties after backing up
    this.updateCurrentState();
  }

  /**
   * Check if we're at the end of input
   */
  isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  /**
   * Get current position information
   */
  getPosition(): CursorPosition {
    return {
      line: this.line,
      column: this.column,
      index: this.position,
    };
  }

  /**
   * Set position to a specific index
   */
  setPosition(index: number): void {
    if (index < 0 || index > this.input.length) {
      throw new Error(`Invalid position: ${index}`);
    }

    const oldPosition = this.position;

    // If we're moving backwards significantly, recalculate line/column
    if (index < this.position && this.options.trackPosition) {
      this.recalculatePosition(index);
    } else {
      // Moving forward, update position normally
      while (this.position < index && !this.isAtEnd()) {
        this.advance();
      }
    }

    // Ensure state is updated if position didn't actually change
    if (this.position === oldPosition) {
      this.updateCurrentState();
    }
  }

  /**
   * Recalculate line and column for a given position
   */
  private recalculatePosition(targetIndex: number): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;

    while (this.position < targetIndex && !this.isAtEnd()) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }

    // Update debugging properties after recalculating position
    this.updateCurrentState();
  }

  /**
   * Match a specific string at current position, skipping ignored characters
   */
  match(expected: string): boolean {
    let pos = this.position;
    let expectedIndex = 0;

    while (expectedIndex < expected.length && pos < this.input.length) {
      // Skip ignored characters in the input
      while (pos < this.input.length && this.shouldIgnoreChar(this.input[pos])) {
        pos++;
      }

      // Check if we've reached end of input
      if (pos >= this.input.length) {
        return false;
      }

      // Compare current character with expected character
      if (this.input[pos] !== expected[expectedIndex]) {
        return false;
      }

      pos++;
      expectedIndex++;
    }

    return expectedIndex === expected.length;
  }

  /**
   * Consume a specific string if it matches
   */
  consume(expected: string): boolean {
    if (this.match(expected)) {
      for (let i = 0; i < expected.length; i++) {
        this.advance();
      }
      return true;
    }
    return false;
  }

  /**
   * Skip whitespace characters
   */
  skipWhitespace(count: number = -1): void {
    while (!this.isAtEnd() && this.isWhitespace(this.peek()!)) {
      this.advance();
      count--;
      if (count === 0) {
        break;
      }
    }
  }

  /**
   * Check if character is whitespace
   */
  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  /**
   * Check if a character should be ignored based on options
   */
  private shouldIgnoreChar(char: string): boolean {
    // Check if it's in the explicitly ignored characters list
    if (this.ignoredChars.includes(char)) {
      return true;
    }

    // Check if it's whitespace and ignoreWhitespace is enabled
    if (this.options.ignoreWhitespace && this.isWhitespace(char)) {
      return true;
    }

    return false;
  }

  /**
   * Read characters while condition is true
   */
  readWhile(condition: (char: string) => boolean): string {
    let result = '';
    while (!this.isAtEnd() && condition(this.peek()!)) {
      result += this.next();
    }
    return result;
  }

  /**
   * Read characters until condition is true (or end of input)
   */
  readUntil(condition: (char: string) => boolean): string {
    let result = '';
    while (!this.isAtEnd() && !condition(this.peek()!)) {
      result += this.next();
    }
    return result;
  }

  /**
   * Read a specific number of characters
   */
  read(count: number): string {
    let result = '';
    for (let i = 0; i < count && !this.isAtEnd(); i++) {
      result += this.next();
    }
    return result;
  }

  /**
   * Get remaining input from current position
   */
  getRemainingInput(): string {
    return this.getRemainingText();
  }

  /**
   * Peek ahead to read a marker name without advancing the cursor
   * Used for looking ahead to check marker types in parsing logic
   */
  peekMarkerName(): string | null {
    if (this.peek() !== '\\') {
      return null;
    }

    let tempPos = this.position + 1; // Skip the backslash

    // Read base marker name (letters)
    let baseName = '';
    while (tempPos < this.input.length && /[a-zA-Z]/.test(this.input[tempPos])) {
      baseName += this.input[tempPos];
      tempPos++;
    }

    if (baseName.length === 0) {
      return null;
    }

    // Read level (numbers)
    let level = '';
    while (tempPos < this.input.length && /[0-9]/.test(this.input[tempPos])) {
      level += this.input[tempPos];
      tempPos++;
    }

    // Read position (dash followed by letters)
    let position = '';
    if (tempPos < this.input.length && this.input[tempPos] === '-') {
      tempPos++; // Skip the dash
      while (tempPos < this.input.length && /[a-zA-Z]/.test(this.input[tempPos])) {
        position += this.input[tempPos];
        tempPos++;
      }
    }

    return `${baseName}${level}${position ? `-${position}` : ''}`;
  }

  /**
   * Get the full input string
   */
  getFullInput(): string {
    return this.input;
  }

  /**
   * Get current position index
   */
  getCurrentIndex(): number {
    return this.position;
  }

  /**
   * Check if we can read more characters
   */
  hasMore(): boolean {
    return !this.isAtEnd();
  }

  /**
   * Reset parser to beginning
   */
  reset(): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.updateCurrentState(); // Reset debugging properties
  }

  /**
   * Create a snapshot of current cursor state
   */
  createSnapshot(): CursorSnapshot {
    return {
      position: this.position,
      line: this.line,
      column: this.column,
    };
  }

  /**
   * Restore cursor state from snapshot
   */
  restoreSnapshot(snapshot: CursorSnapshot): void {
    this.position = snapshot.position;
    this.line = snapshot.line;
    this.column = snapshot.column;
    this.updateCurrentState(); // Restore debugging properties
  }

  /**
   * Add a character to the ignored characters list
   */
  addIgnoredChar(char: string): void {
    if (!this.ignoredChars.includes(char)) {
      this.ignoredChars.push(char);
    }
  }

  /**
   * Remove a character from the ignored characters list
   */
  removeIgnoredChar(char: string): void {
    const index = this.ignoredChars.indexOf(char);
    if (index !== -1) {
      this.ignoredChars.splice(index, 1);
    }
  }

  /**
   * Get the current list of ignored characters
   */
  getIgnoredChars(): string[] {
    return [...this.ignoredChars];
  }

  /**
   * Clear all ignored characters
   */
  clearIgnoredChars(): void {
    this.ignoredChars = [];
  }

  /**
   * Enable or disable debug mode at runtime
   */
  setDebugMode(enabled: boolean): void {
    this.options.debug = enabled;
    if (enabled) {
      // Update debug properties immediately when enabled
      this.updateCurrentState();
    } else {
      // Clear debug properties when disabled to free memory
      this.remainingText = '';
      this.processedText = '';
    }
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this.options.debug || false;
  }

  /**
   * Get processed text (from start to current position) - computed on demand
   */
  getProcessedText(): string {
    return this.input.substring(0, this.position);
  }

  /**
   * Get remaining text (from current position to end) - computed on demand
   */
  getRemainingText(): string {
    return this.input.substring(this.position);
  }

  /**
   * Get debug information object - useful for logging/debugging
   */
  getDebugInfo(): {
    currentChar: string | null;
    processedText: string;
    remainingText: string;
    position: CursorPosition;
  } {
    return {
      currentChar: this.currentChar,
      processedText: this.getProcessedText(),
      remainingText: this.getRemainingText(),
      position: this.getPosition(),
    };
  }
}

export interface CursorSnapshot {
  position: number;
  line: number;
  column: number;
}
