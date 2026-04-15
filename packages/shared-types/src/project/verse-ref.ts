/** Single verse coordinate */
export interface VerseRef {
  chapter: number;
  verse: number;
}

/** Inclusive scripture range; omit `end` for a single verse at `start`. */
export interface ScriptureRef {
  start: VerseRef;
  end?: VerseRef;
}
