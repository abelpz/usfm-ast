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
   * BCP 47 language code of this source text, when known (e.g. `'es-419'`, `'en'`).
   * Used to auto-discover translation helps (TN/TWL) from the Door43 catalog.
   * Providers that cannot determine the language leave this `undefined`.
   */
  readonly langCode?: string;
  /**
   * Block text direction when known (e.g. from Door43 `ld` or manifest).
   * If omitted, the app may infer direction from {@link langCode}.
   */
  readonly direction?: 'ltr' | 'rtl';
  /**
   * Load (or reload) the source document.
   * Must resolve to a full-book {@link UsjDocument}; may reject on failure.
   */
  load(): Promise<UsjDocument>;
}
