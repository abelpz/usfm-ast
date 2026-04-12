import type { DocumentStore, Operation } from '../dist';
import { HeadlessCollabSession } from '../dist';

/** Same shape as {@link conflict-resolution.intensive.test.ts} SAMPLE — paths `[0,1,0]` are valid for verse 1. */
export const SAMPLE_TWO_VERSE_USFM = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 First verse text.
\v 2 Second verse text.
`;

/** Verse 1 inline text path in {@link SAMPLE_TWO_VERSE_USFM} (see intensive merge tests). */
export const SAMPLE_CH1_VERSE1_TEXT_PATH = { chapter: 1, indices: [0, 1, 0] as number[] };

export const SAMPLE_V1_INITIAL_TEXT = 'First verse text.';

/** Force {@link DocumentStore.applyOperations} to throw when `predicate` matches. */
export function failApplyWhen(store: DocumentStore, predicate: (ops: Operation[]) => boolean): void {
  const inner = store.applyOperations.bind(store);
  store.applyOperations = (ops: Operation[]) => {
    if (predicate(ops)) throw new Error('simulated apply failure');
    inner(ops);
  };
}

/** Content ops produced by {@link HeadlessCollabSession.editVerse} (correct paths for the parser). */
export function contentOpsForVerseEdit(chapter: number, verse: number, newText: string): Operation[] {
  const h = new HeadlessCollabSession({ userId: 'probe' });
  h.loadUSFM(SAMPLE_TWO_VERSE_USFM);
  h.editVerse(chapter, verse, newText);
  const entry = h.journal.getAll().at(-1);
  h.destroy();
  return (entry?.operations ?? []).filter(
    (o) =>
      o.type !== 'alignWord' && o.type !== 'unalignWord' && o.type !== 'updateGroup'
  ) as Operation[];
}

/** Same paths as {@link contentOpsForVerseEdit} but forces merge-apply failure (see tests using {@link failApplyWhen}). */
export function mergeFailServerPrimeOps(): Operation[] {
  const ops = contentOpsForVerseEdit(1, 1, '___probe___');
  const first = ops[0];
  if (!first || first.type !== 'setText') throw new Error('expected setText op');
  return [{ ...first, text: '__MERGE_FAIL__' }, ...ops.slice(1)];
}
