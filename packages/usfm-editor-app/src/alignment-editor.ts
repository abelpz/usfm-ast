import type { AlignmentGroup, AlignedWord, OriginalWord } from '@usfm-tools/types';
import type { ScriptureSession } from '@usfm-tools/editor';
import { findVerseInlineNodes, tokenizeWords } from '@usfm-tools/editor-core';

function flattenInlineToText(nodes: unknown[]): string {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') s += n;
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>;
      const t = o.type;
      if ((t === 'char' || t === 'note') && Array.isArray(o.content)) {
        s += flattenInlineToText(o.content as unknown[]);
      }
    }
  }
  return s;
}

function listVerseSids(content: unknown[]): string[] {
  const out: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      if (o.type === 'verse' && typeof o.sid === 'string') out.push(o.sid);
      if (Array.isArray(o.content)) walk(o.content as unknown[]);
    }
  };
  walk(content);
  return out;
}

/** Prefer "Chapter c, Verse v" when `sid` contains c:v. */
function verseSidToLabel(sid: string): string {
  const m = sid.match(/(\d+)\s*:\s*(\d+)/);
  if (m) {
    return `Chapter ${m[1]}, Verse ${m[2]}`;
  }
  return sid;
}

function chipClass(base: string, groupIdx: number | null, selected: boolean): string {
  let c = base;
  if (selected) c += ' selected';
  if (groupIdx !== null) c += ` align-g${groupIdx % 6}`;
  return c;
}

function appendWordChip(
  parent: HTMLElement,
  word: string,
  wordIndex: number,
  words: string[],
  groupIdx: number | null,
  selected: boolean,
  onClick: () => void
): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = chipClass('chip', groupIdx, selected);
  const dupCount = words.filter((w) => w === word).length;
  const occ = words.slice(0, wordIndex).filter((w) => w === word).length + 1;
  b.append(document.createTextNode(word));
  if (dupCount > 1) {
    const sup = document.createElement('sup');
    sup.textContent = String(occ);
    b.append(sup);
  }
  b.addEventListener('click', onClick);
  parent.appendChild(b);
}

/**
 * Verse-by-verse alignment: original-language row, translation row, grouped chips, Accept / Reject / Clear.
 */
export function mountAlignmentEditor(container: HTMLElement, session: ScriptureSession): () => void {
  container.classList.add('alignment-editor');
  container.innerHTML = `
    <div class="alignment-editor__bar">
      <label>Verse <select class="alignment-editor__verse" aria-label="Choose verse"></select></label>
      <span class="alignment-editor__progress" aria-live="polite"></span>
    </div>
    <div class="alignment-editor__rows">
      <div class="alignment-editor__col">
        <h4>Original language</h4>
        <div class="alignment-editor__src chips" role="group" aria-label="Original language words"></div>
      </div>
      <div class="alignment-editor__col">
        <h4>Translation</h4>
        <div class="alignment-editor__tgt chips" role="group" aria-label="Translation words"></div>
      </div>
    </div>
    <div class="alignment-editor__actions">
      <button type="button" class="alignment-editor__link">Create group from selection</button>
      <button type="button" class="alignment-editor__accept">Accept verse</button>
      <div class="alignment-editor__reject-block">
        <button type="button" class="alignment-editor__reject">Reject (clear)</button>
        <div class="alignment-editor__confirm" hidden role="group" aria-label="Confirm clear alignments">
          <span class="alignment-editor__confirm-msg">Clear all alignments for this verse?</span>
          <button type="button" class="alignment-editor__confirm-yes">Clear</button>
          <button type="button" class="alignment-editor__confirm-no">Cancel</button>
        </div>
      </div>
      <button type="button" class="alignment-editor__clear">Clear selection</button>
    </div>
    <p class="alignment-editor__hint">Select tokens on both rows, then <strong>Create group from selection</strong> (N:M). Unaligned chips use a neutral style.</p>
  `;

  const verseSel = container.querySelector('.alignment-editor__verse') as HTMLSelectElement;
  const srcEl = container.querySelector('.alignment-editor__src') as HTMLElement;
  const tgtEl = container.querySelector('.alignment-editor__tgt') as HTMLElement;
  const progressEl = container.querySelector('.alignment-editor__progress') as HTMLElement;
  const rejectBtn = container.querySelector('.alignment-editor__reject') as HTMLButtonElement;
  const confirmBox = container.querySelector('.alignment-editor__confirm') as HTMLElement;
  const confirmYes = container.querySelector('.alignment-editor__confirm-yes') as HTMLButtonElement;
  const confirmNo = container.querySelector('.alignment-editor__confirm-no') as HTMLButtonElement;

  let selectedSrc: number[] = [];
  let selectedTgt: number[] = [];
  /** Per-verse “reviewed” flag for Accept */
  const accepted = new Set<string>();

  function hideConfirm() {
    confirmBox.hidden = true;
    rejectBtn.hidden = false;
  }

  function sourceWordsFromGroups(groups: AlignmentGroup[], gwTokens: string[]): OriginalWord[] {
    const fromGroups = groups.flatMap((g) => g.sources);
    if (fromGroups.length > 0) return fromGroups;
    return gwTokens.map((w, i) => ({
      strong: '',
      lemma: '',
      content: w,
      occurrence: i + 1,
      occurrences: gwTokens.length,
    }));
  }

  function render() {
    const usj = session.store.getFullUSJ();
    const sids = listVerseSids(usj.content as unknown[]);
    const prev = verseSel.value;
    verseSel.innerHTML = '';
    for (const sid of sids) {
      const o = document.createElement('option');
      o.value = sid;
      o.textContent = verseSidToLabel(sid);
      verseSel.appendChild(o);
    }
    if (sids.length) {
      verseSel.value = sids.includes(prev) ? prev : sids[0]!;
    }

    const sid = verseSel.value || '';
    const inline = sid ? findVerseInlineNodes(usj.content as unknown[], sid) : [];
    const gwTokens = tokenizeWords(flattenInlineToText(inline));
    const groups = session.getAlignmentsForVerse(sid);
    const srcWords = sourceWordsFromGroups(groups, gwTokens);

    const tgtGroupIndex = (ti: number): number | null => {
      for (let gi = 0; gi < groups.length; gi++) {
        const t = groups[gi].targets;
        for (const tw of t) {
          const idx = gwTokens.findIndex(
            (w, wi) => w === tw.word && wi + 1 === ti + 1
          );
          if (idx === ti) return gi;
        }
      }
      for (let gi = 0; gi < groups.length; gi++) {
        if (groups[gi].targets.some((_, j) => j === ti)) return gi;
      }
      return null;
    };

    const srcGroupIndex = (si: number): number | null => {
      for (let gi = 0; gi < groups.length; gi++) {
        const s = groups[gi].sources;
        if (s.some((_, j) => j === si)) return gi;
        if (s[si]) return gi;
      }
      if (groups.length > 0 && si < groups.length) return si;
      return null;
    };

    const srcText = srcWords.map((w) => w.content || (w as { word?: string }).word || '');

    srcEl.innerHTML = '';
    srcText.forEach((text, i) => {
      const gi = groups.length ? srcGroupIndex(i) : null;
      appendWordChip(
        srcEl,
        text,
        i,
        srcText,
        gi,
        selectedSrc.includes(i),
        () => {
          const ix = selectedSrc.indexOf(i);
          if (ix >= 0) selectedSrc.splice(ix, 1);
          else selectedSrc.push(i);
          render();
        }
      );
    });

    tgtEl.innerHTML = '';
    gwTokens.forEach((w, i) => {
      const gi = tgtGroupIndex(i);
      appendWordChip(
        tgtEl,
        w,
        i,
        gwTokens,
        gi,
        selectedTgt.includes(i),
        () => {
          const ix = selectedTgt.indexOf(i);
          if (ix >= 0) selectedTgt.splice(ix, 1);
          else selectedTgt.push(i);
          render();
        }
      );
    });

    const total = gwTokens.length;
    const aligned = groups.reduce((n, g) => n + g.targets.length, 0);
    progressEl.textContent =
      total > 0
        ? `Verse progress: ~${Math.min(100, Math.round((aligned / total) * 100))}% aligned${
            accepted.has(sid) ? ' · accepted' : ''
          }`
        : '';
  }

  verseSel.addEventListener('change', () => {
    selectedSrc = [];
    selectedTgt = [];
    hideConfirm();
    render();
  });

  container.querySelector('.alignment-editor__link')!.addEventListener('click', () => {
    const sid = verseSel.value;
    if (!sid || (selectedSrc.length === 0 && selectedTgt.length === 0)) return;
    const usj = session.store.getFullUSJ();
    const inline = findVerseInlineNodes(usj.content as unknown[], sid);
    const gwTokens = tokenizeWords(flattenInlineToText(inline));
    const prev = session.getAlignmentsForVerse(sid);

    const targets: AlignedWord[] = selectedTgt.sort((a, b) => a - b).map((i) => ({
      word: gwTokens[i] ?? '',
      occurrence: i + 1,
      occurrences: gwTokens.length,
    }));

    const sources: OriginalWord[] =
      selectedSrc.length > 0
        ? selectedSrc.sort((a, b) => a - b).map((i) => ({
            strong: '',
            lemma: '',
            content: gwTokens[i] ?? '',
            occurrence: i + 1,
            occurrences: gwTokens.length,
          }))
        : targets.map((t) => ({
            strong: '',
            lemma: '',
            content: t.word,
            occurrence: t.occurrence,
            occurrences: t.occurrences,
          }));

    const group: AlignmentGroup = { sources, targets };
    session.updateAlignment(sid, [...prev, group]);
    selectedSrc = [];
    selectedTgt = [];
    render();
  });

  container.querySelector('.alignment-editor__accept')!.addEventListener('click', () => {
    const sid = verseSel.value;
    if (sid) accepted.add(sid);
    render();
  });

  rejectBtn.addEventListener('click', () => {
    rejectBtn.hidden = true;
    confirmBox.hidden = false;
  });

  confirmNo.addEventListener('click', () => {
    hideConfirm();
  });

  confirmYes.addEventListener('click', () => {
    const sid = verseSel.value;
    if (!sid) {
      hideConfirm();
      return;
    }
    session.updateAlignment(sid, []);
    accepted.delete(sid);
    selectedSrc = [];
    selectedTgt = [];
    hideConfirm();
    render();
  });

  container.querySelector('.alignment-editor__clear')!.addEventListener('click', () => {
    selectedSrc = [];
    selectedTgt = [];
    render();
  });

  const unAlign = session.onAlignmentChange(() => render());
  const unCh = session.onChange(() => render());

  render();

  return () => {
    unAlign();
    unCh();
    container.innerHTML = '';
  };
}
