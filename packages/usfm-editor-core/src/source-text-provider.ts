import type { UsjDocument } from './document-store';

/**
 * Pluggable source-text provider. Implement this interface to supply a
 * read-only reference text from any origin: a local file, a DCS repository,
 * a custom scripture API, etc.
 *
 * Pass an instance to {@link SourceTextSession.load} to display the text in
 * the source panel.
 *
 * @example
 * ```ts
 * class MyApiProvider implements SourceTextProvider {
 *   id = 'my-api';
 *   displayName = 'My Scripture API';
 *   async load() {
 *     const res = await fetch('/api/source/luk.usj');
 *     return res.json() as UsjDocument;
 *   }
 * }
 * ```
 */
export interface SourceTextProvider {
  /** Unique machine identifier, e.g. `'file'`, `'dcs'`. */
  readonly id: string;
  /** Human-readable label shown in the UI. */
  readonly displayName: string;
  /**
   * Load (or reload) the source document.
   * Must resolve to a full-book {@link UsjDocument}; may reject on failure.
   */
  load(): Promise<UsjDocument>;
}
