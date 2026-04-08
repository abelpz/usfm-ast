import type { ChapterConflict, SyncResult } from '@usfm-tools/editor-core';

/**
 * Sync conflicts: content tab (op diff) and alignment tab (per-verse group diff).
 */
export function mountConflictReview(
  container: HTMLElement,
  result: SyncResult,
  options?: {
    onDismiss?: () => void;
    onResolveContent?: (c: ChapterConflict, side: 'local' | 'remote') => void;
    onResolveAlignment?: (c: ChapterConflict, side: 'local' | 'remote') => void;
  }
): () => void {
  container.classList.add('conflict-review');
  const { conflicts } = result;
  if (conflicts.length === 0) {
    container.innerHTML = '<p class="conflict-review__empty">No conflicts.</p>';
    return () => {
      container.innerHTML = '';
    };
  }

  const content = conflicts.filter((c) => c.layer === 'content');
  const align = conflicts.filter((c) => c.layer === 'alignment');

  container.innerHTML = `
    <div class="conflict-review__header">
      <strong>Sync conflicts</strong>
      <button type="button" class="conflict-review__close">Close</button>
    </div>
    <div class="conflict-review__tabs">
      <button type="button" class="conflict-review__tab active" data-tab="content">Content (${content.length})</button>
      <button type="button" class="conflict-review__tab" data-tab="alignment">Alignment (${align.length})</button>
    </div>
    <div class="conflict-review__panel" data-panel="content"></div>
    <div class="conflict-review__panel hidden" data-panel="alignment"></div>
  `;

  const panelContent = container.querySelector('[data-panel="content"]') as HTMLElement;
  const panelAlign = container.querySelector('[data-panel="alignment"]') as HTMLElement;

  function renderContentConflict(c: ChapterConflict): HTMLElement {
    const row = document.createElement('div');
    row.className = 'conflict-review__item';
    const head = document.createElement('div');
    head.className = 'conflict-review__item-title';
    head.textContent = `Chapter ${c.chapter} · content`;
    row.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'conflict-review__diff-grid conflict-review__diff-grid--3';

    if (c.baseSnapshot) {
      const baseCol = document.createElement('div');
      baseCol.className = 'conflict-review__diff-col';
      baseCol.innerHTML = `<div class="conflict-review__diff-label">Base (ancestor)</div>`;
      const preB = document.createElement('pre');
      preB.className = 'conflict-review__pre';
      preB.textContent = JSON.stringify(c.baseSnapshot, null, 2);
      baseCol.appendChild(preB);
      grid.appendChild(baseCol);
    }

    const left = document.createElement('div');
    left.className = 'conflict-review__diff-col';
    left.innerHTML = `<div class="conflict-review__diff-label">Local ops (${c.localOps?.length ?? 0})</div>`;
    const preL = document.createElement('pre');
    preL.className = 'conflict-review__pre';
    preL.textContent = JSON.stringify(c.localOps ?? [], null, 2);
    left.appendChild(preL);

    const right = document.createElement('div');
    right.className = 'conflict-review__diff-col';
    right.innerHTML = `<div class="conflict-review__diff-label">Remote ops (${c.remoteOps?.length ?? 0})</div>`;
    const preR = document.createElement('pre');
    preR.className = 'conflict-review__pre';
    preR.textContent = JSON.stringify(c.remoteOps ?? [], null, 2);
    right.appendChild(preR);

    grid.appendChild(left);
    grid.appendChild(right);
    row.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'conflict-review__resolve';
    const b1 = document.createElement('button');
    b1.type = 'button';
    b1.textContent = 'Use local';
    b1.addEventListener('click', () => options?.onResolveContent?.(c, 'local'));
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.textContent = 'Use remote';
    b2.addEventListener('click', () => options?.onResolveContent?.(c, 'remote'));
    actions.appendChild(b1);
    actions.appendChild(b2);
    row.appendChild(actions);

    return row;
  }

  function renderAlignmentConflict(c: ChapterConflict): HTMLElement {
    const row = document.createElement('div');
    row.className = 'conflict-review__item';
    const head = document.createElement('div');
    head.className = 'conflict-review__item-title';
    head.textContent = `Chapter ${c.chapter} · alignment`;
    row.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'conflict-review__diff-grid';

    const left = document.createElement('div');
    left.className = 'conflict-review__diff-col';
    left.innerHTML = `<div class="conflict-review__diff-label">Local alignments</div>`;
    const preL = document.createElement('pre');
    preL.className = 'conflict-review__pre';
    preL.textContent = JSON.stringify(c.localAlignments ?? {}, null, 2);
    left.appendChild(preL);

    const right = document.createElement('div');
    right.className = 'conflict-review__diff-col';
    right.innerHTML = `<div class="conflict-review__diff-label">Remote alignments</div>`;
    const preR = document.createElement('pre');
    preR.className = 'conflict-review__pre';
    preR.textContent = JSON.stringify(c.remoteAlignments ?? {}, null, 2);
    right.appendChild(preR);

    grid.appendChild(left);
    grid.appendChild(right);
    row.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'conflict-review__resolve';
    const b1 = document.createElement('button');
    b1.type = 'button';
    b1.textContent = 'Use local';
    b1.addEventListener('click', () => options?.onResolveAlignment?.(c, 'local'));
    const b2 = document.createElement('button');
    b2.type = 'button';
    b2.textContent = 'Use remote';
    b2.addEventListener('click', () => options?.onResolveAlignment?.(c, 'remote'));
    actions.appendChild(b1);
    actions.appendChild(b2);
    row.appendChild(actions);

    return row;
  }

  function renderList(target: HTMLElement, list: ChapterConflict[], kind: 'content' | 'alignment') {
    target.innerHTML = '';
    for (const c of list) {
      target.appendChild(
        kind === 'content' ? renderContentConflict(c) : renderAlignmentConflict(c)
      );
    }
  }

  renderList(panelContent, content, 'content');
  renderList(panelAlign, align, 'alignment');

  const close = container.querySelector('.conflict-review__close') as HTMLButtonElement;
  close.addEventListener('click', () => options?.onDismiss?.());

  container.querySelectorAll('.conflict-review__tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLButtonElement).dataset.tab;
      container.querySelectorAll('.conflict-review__tab').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      panelContent.classList.toggle('hidden', tab !== 'content');
      panelAlign.classList.toggle('hidden', tab !== 'alignment');
    });
  });

  return () => {
    container.innerHTML = '';
  };
}
