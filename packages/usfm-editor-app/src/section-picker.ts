import type { ScriptureSession } from '@usfm-tools/editor';

/**
 * Chapter navigation: chip row (prominent) with collapsible advanced controls
 * (Introduction toggle, chapter range picker).
 */
export function mountSectionPicker(
  container: HTMLElement,
  session: ScriptureSession,
  options?: {
    onWindowNotice?: (msg: string) => void;
  }
): () => void {
  const maxSel = session.maxVisibleChapters;
  const contextN = session.getContextChapterRadius();

  container.classList.add('section-picker');
  container.innerHTML = `
    <div class="section-picker__nav">
      <div class="section-picker__chips-scroll">
        <div class="section-picker__chips" role="list"></div>
      </div>
      <span class="section-picker__limit"></span>
      <button type="button" class="section-picker__adv-toggle"
        title="Navigation options" aria-expanded="false" aria-controls="sp-advanced">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden="true">
          <rect y="0" width="14" height="1.5" rx="0.75"/>
          <rect y="4.25" width="10" height="1.5" rx="0.75"/>
          <rect y="8.5" width="6" height="1.5" rx="0.75"/>
        </svg>
      </button>
    </div>
    <div id="sp-advanced" class="section-picker__advanced" hidden>
      <button type="button" class="section-picker__intro" aria-pressed="false"
        title="Toggle book introduction">Introduction</button>
      <label class="section-picker__range">
        <span class="section-picker__range-label">Ch.</span>
        <input type="number" min="1" class="section-picker__from" title="From chapter" />
        <span class="section-picker__range-dash">–</span>
        <input type="number" min="1" class="section-picker__to" title="To chapter" />
        <button type="button" class="section-picker__apply-range">Go</button>
      </label>
      <span class="section-picker__hint"
        title="Dimmed chapters are read-only context"></span>
    </div>
  `;

  const btnAdvToggle = container.querySelector('.section-picker__adv-toggle') as HTMLButtonElement;
  const advPanel = container.querySelector('.section-picker__advanced') as HTMLElement;
  const btnIntro = container.querySelector('.section-picker__intro') as HTMLButtonElement;
  const inpFrom = container.querySelector('.section-picker__from') as HTMLInputElement;
  const inpTo = container.querySelector('.section-picker__to') as HTMLInputElement;
  const btnApply = container.querySelector('.section-picker__apply-range') as HTMLButtonElement;
  const chipsEl = container.querySelector('.section-picker__chips') as HTMLElement;
  const limitEl = container.querySelector('.section-picker__limit') as HTMLElement;
  const hintEl = container.querySelector('.section-picker__hint') as HTMLElement;

  let lastSections = JSON.stringify(session.getVisibleSections());

  btnAdvToggle.addEventListener('click', () => {
    const expanded = advPanel.hidden;
    advPanel.hidden = !expanded;
    btnAdvToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });

  function renderChips() {
    const total = Math.max(1, session.getChapterCount());
    inpFrom.min = '1';
    inpTo.min = '1';
    inpFrom.max = String(total);
    inpTo.max = String(total);

    const selected = new Set(session.getVisibleChapterNumbers());
    const roles = session.getExpandedChapterRoles();
    const readonlySet = new Set(roles.filter((r) => r.readonly).map((r) => r.chapter));

    if (!inpFrom.value) inpFrom.value = String([...selected][0] ?? 1);
    if (!inpTo.value) inpTo.value = String(Math.max(...[...selected], 1));

    chipsEl.innerHTML = '';
    for (let c = 1; c <= total; c++) {
      if (c > 1 && c % 10 === 0) {
        const g = document.createElement('span');
        g.className = 'section-picker__group-mark';
        g.textContent = String(c);
        chipsEl.appendChild(g);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'section-picker__chip';
      b.textContent = String(c);
      b.dataset.chapter = String(c);
      const isSel = selected.has(c);
      const isRo = readonlySet.has(c);
      b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      if (isSel) b.classList.add('section-picker__chip--on');
      if (isRo) b.classList.add('section-picker__chip--ctx');
      b.addEventListener('click', () => {
        const cur = new Set(session.getVisibleChapterNumbers());
        if (cur.has(c)) cur.delete(c);
        else cur.add(c);
        let next = [...cur].sort((a, b) => a - b);
        if (next.length === 0) next = [1];
        if (next.length > maxSel) next = next.slice(0, maxSel);
        session.setVisibleChapters(next);
        renderChips();
      });
      chipsEl.appendChild(b);
    }

    const nums = [...selected].sort((a, b) => a - b);
    if (nums.length >= 1) {
      const lo = nums[0]!;
      const hi = nums[nums.length - 1]!;
      limitEl.textContent =
        lo === hi
          ? `Ch. ${lo} of ${total}`
          : `Ch. ${lo}–${hi} of ${total}`;
    } else {
      limitEl.textContent = `${total} chapters`;
    }

    if (nums.length >= 1) {
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      hintEl.textContent =
        nums.length > 1
          ? `Context ±${contextN} around ch ${lo}–${hi}`
          : `Context ±${contextN} around ch ${lo}`;
    } else {
      hintEl.textContent = '';
    }
  }

  btnIntro.addEventListener('click', () => {
    session.setIntroductionVisible(!session.isIntroductionVisible());
    btnIntro.setAttribute('aria-pressed', session.isIntroductionVisible() ? 'true' : 'false');
    btnIntro.classList.toggle('section-picker__intro--on', session.isIntroductionVisible());
  });

  btnApply.addEventListener('click', () => {
    const total = Math.max(1, session.getChapterCount());
    const a = Math.max(1, Math.min(total, Number(inpFrom.value) || 1));
    const b = Math.max(1, Math.min(total, Number(inpTo.value) || a));
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const range: number[] = [];
    for (let i = lo; i <= hi; i++) range.push(i);
    session.setVisibleChapters(range.slice(0, maxSel));
    renderChips();
  });

  const unsub = session.onVisibleSectionsChange(() => {
    const ser = JSON.stringify(session.getVisibleSections());
    if (ser !== lastSections) {
      lastSections = ser;
      options?.onWindowNotice?.('Section window updated');
    }
    renderChips();
  });

  const unsubCh = session.onChange(() => {
    renderChips();
  });

  btnIntro.setAttribute('aria-pressed', session.isIntroductionVisible() ? 'true' : 'false');
  btnIntro.classList.toggle('section-picker__intro--on', session.isIntroductionVisible());
  renderChips();

  return () => {
    unsub();
    unsubCh();
    container.innerHTML = '';
  };
}
