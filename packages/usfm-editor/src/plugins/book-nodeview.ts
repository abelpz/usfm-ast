import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { ResolvedUSFMChrome } from '../chrome';
import { filterBookCodes, KNOWN_BOOK_CODES } from './book-codes';

/** Valid USFM book codes — 3 uppercase alphanumeric characters (e.g. GEN, 1SA, REV). */
const BOOK_CODE_RE = /^[A-Z0-9]{3}$/;

function validateBookCode(raw: string): { code: string; valid: boolean; empty: boolean } {
  const code = raw.trim().toUpperCase();
  return { code, valid: BOOK_CODE_RE.test(code), empty: code === '' };
}

/** Scrollable ancestors of `el` (for attaching `scroll` listeners, same idea as editor-app WYSIWYG chrome). */
function isScrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  const oy = s.overflowY;
  const ox = s.overflowX;
  const y =
    (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1;
  const x =
    (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth + 1;
  return y || x;
}

function collectScrollContainers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    if (isScrollable(cur)) out.push(cur);
    cur = cur.parentElement;
  }
  return out;
}

/**
 * `book` (`\\id`) block: **book code** as a searchable combobox (input + dropdown list of all
 * standard USFM codes filtered by what the user types); **inline content** is the remainder of
 * the id line (e.g. `EN_ULT`).
 *
 * Fixes:
 * - No longer auto-fills the input with "UNK" while the user is editing.
 * - Validation errors don't steal focus — they update `data-invalid` only.
 * - ArrowLeft at start of input / ArrowLeft from PM body → navigate between input and editor.
 * - **ProseMirror pattern** for node views with chrome + `contentDOM`: the outer `dom` is
 *   `contenteditable="false"` and only `contentDOM` is `contenteditable="true"` (editable island).
 *   Otherwise the host treats the whole block as one surface and `<input>` clicks do nothing.
 */
export function createBookNodeView(
  chrome: ResolvedUSFMChrome
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return (initialNode, view, getPos) => {
    let node = initialNode;

    /* ── Outer NodeView container ───────────────────────────────────────── */
    const dom = document.createElement('div');
    dom.className =
      chrome.bookId.layout === 'inline' ? 'usfm-book usfm-book--layout-inline' : 'usfm-book';
    dom.setAttribute('data-code', String(node.attrs.code ?? 'UNK'));
    dom.setAttribute('data-marker', 'id');
    // Outer shell must NOT be editable — only `contentDOM` is. Same pattern as PM widgets
    // (`contentEditable = false` on the widget root). Lets `<input>` / dropdown work inside
    // the ProseMirror `contenteditable` host without the host swallowing pointer/focus.
    dom.setAttribute('contenteditable', 'false');

    /* ── Combobox wrapper ───────────────────────────────────────────────── */
    const combobox = document.createElement('div');
    combobox.className = 'usfm-book-code-combobox';
    combobox.setAttribute('role', 'combobox');
    combobox.setAttribute('aria-haspopup', 'listbox');
    combobox.setAttribute('aria-expanded', 'false');

    /* ── Text input (trigger + filter) ─────────────────────────────────── */
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.className = 'usfm-book-code-field';
    codeInput.value = String(node.attrs.code ?? 'UNK');
    codeInput.setAttribute('aria-label', 'Book code');
    codeInput.setAttribute('aria-autocomplete', 'list');
    codeInput.spellcheck = false;
    codeInput.maxLength = 10; // allow longer queries when filtering by name
    codeInput.autocomplete = 'off';
    codeInput.placeholder = 'e.g. MAT';

    /* ── Dropdown ───────────────────────────────────────────────────────── */
    const dropdown = document.createElement('div');
    dropdown.className = 'usfm-book-code-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Book codes');
    dropdown.hidden = true;

    combobox.appendChild(codeInput);
    // Dropdown is mounted on body so position:fixed works from any scroll context.
    document.body.appendChild(dropdown);

    /* ── Content span (ProseMirror contentDOM) ──────────────────────────── */
    const contentSpan = document.createElement('span');
    contentSpan.className = 'usfm-book-content';
    // Editable island inside `dom` (which is `contenteditable=false`). Required for PM text.
    contentSpan.setAttribute('contenteditable', 'true');

    dom.appendChild(combobox);
    dom.appendChild(contentSpan);

    /* ── State ──────────────────────────────────────────────────────────── */
    let activeIndex = -1; // highlighted row in the dropdown (-1 = none)
    let currentOptions: readonly [string, string][] = [];

    /* ── Validation UI ──────────────────────────────────────────────────── */
    function applyValidationUI(raw: string) {
      const { code, valid, empty } = validateBookCode(raw);
      if (empty) {
        codeInput.dataset.invalid = 'empty';
        codeInput.title = 'Book code is required (3 uppercase letters/digits, e.g. MAT)';
      } else if (!valid) {
        codeInput.dataset.invalid = 'format';
        codeInput.title = 'Book code must be exactly 3 uppercase letters or digits (e.g. GEN, 1SA)';
      } else if (!KNOWN_BOOK_CODES.has(code)) {
        codeInput.dataset.invalid = 'unknown';
        codeInput.title = `"${code}" is not a standard USFM book code — it will be accepted as a custom code.`;
      } else {
        delete codeInput.dataset.invalid;
        codeInput.title = '';
      }
      return code;
    }

    applyValidationUI(codeInput.value);

    /* ── Sync attribute to document ─────────────────────────────────────── */
    function syncCodeAttr(forceInvalid = false) {
      // Normalize to uppercase preserving cursor position.
      const selStart = codeInput.selectionStart ?? codeInput.value.length;
      const selEnd = codeInput.selectionEnd ?? codeInput.value.length;
      const upper = codeInput.value.toUpperCase();
      if (codeInput.value !== upper) {
        codeInput.value = upper;
        codeInput.setSelectionRange(selStart, selEnd);
      }

      applyValidationUI(codeInput.value);

      const pos = getPos();
      if (pos === undefined) return;
      const cur = view.state.doc.nodeAt(pos);
      if (!cur || cur.type.name !== 'book') return;

      const { code, valid } = validateBookCode(codeInput.value);
      // Only sync valid codes live; on forced flush (blur) use UNK as fallback.
      if (!valid && !forceInvalid) return;
      const docCode = valid ? code : 'UNK';

      dom.setAttribute('data-code', docCode);
      if (docCode === String(cur.attrs.code ?? 'UNK')) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, code: docCode }));
    }

    /* ── Dropdown positioning (fixed so it escapes scrollable ancestors) ── */
    function positionDropdown() {
      const rect = codeInput.getBoundingClientRect();
      dropdown.style.top = `${Math.round(rect.bottom + 4)}px`;
      dropdown.style.left = `${Math.round(rect.left)}px`;
    }

    /* ── Dropdown rendering ─────────────────────────────────────────────── */
    function renderDropdown(query: string) {
      currentOptions = filterBookCodes(query);
      activeIndex = -1;
      dropdown.innerHTML = '';

      if (currentOptions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'usfm-book-code-option usfm-book-code-option--empty';
        empty.textContent = 'No matching book codes';
        dropdown.appendChild(empty);
      } else {
        currentOptions.forEach(([code, name], i) => {
          const opt = document.createElement('div');
          opt.className = 'usfm-book-code-option';
          opt.setAttribute('role', 'option');
          opt.setAttribute('aria-selected', 'false');
          opt.id = `usfm-bco-${code}`;

          const codeSpan = document.createElement('span');
          codeSpan.className = 'usfm-book-code-option__code';
          codeSpan.textContent = code;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'usfm-book-code-option__name';
          nameSpan.textContent = name;

          opt.appendChild(codeSpan);
          opt.appendChild(nameSpan);

          // Prevent blur on mousedown so input keeps focus.
          opt.addEventListener('mousedown', (e) => e.preventDefault());
          opt.addEventListener('click', () => selectCode(code));

          dropdown.appendChild(opt);
          // Auto-highlight if it matches current input exactly.
          if (code === codeInput.value.toUpperCase()) {
            setActiveIndex(i);
          }
        });
      }
    }

    function openDropdown() {
      // Mirror the current theme onto the body-mounted dropdown so CSS variables apply.
      const theme = (view.dom as HTMLElement).getAttribute('data-usfm-theme') ?? 'dark';
      dropdown.setAttribute('data-usfm-theme', theme);
      renderDropdown(codeInput.value);
      positionDropdown();
      dropdown.hidden = false;
      combobox.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      dropdown.hidden = true;
      combobox.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    }

    /** Close on page/editor scroll (like WYSIWYG floating bar); keep open when scrolling inside the list. */
    function scrollOriginInsideDropdown(target: EventTarget | null): boolean {
      return target instanceof Node && dropdown.contains(target);
    }
    function closeDropdownOnViewportMove(e: Event) {
      if (dropdown.hidden) return;
      if (scrollOriginInsideDropdown(e.target)) return;
      closeDropdown();
    }

    const scrollSeen = new Set<EventTarget>();
    const scrollTargets: (HTMLElement | Window)[] = [];
    function addScrollTarget(t: HTMLElement | Window) {
      if (scrollSeen.has(t)) return;
      scrollSeen.add(t);
      scrollTargets.push(t);
    }
    addScrollTarget(window);
    addScrollTarget(document.documentElement);
    addScrollTarget(document.body);
    addScrollTarget(view.dom);
    for (const el of collectScrollContainers(view.dom)) addScrollTarget(el);

    const wheelOpts: AddEventListenerOptions = { capture: true, passive: true };
    for (const t of scrollTargets) {
      t.addEventListener('scroll', closeDropdownOnViewportMove, true);
    }
    document.addEventListener('scroll', closeDropdownOnViewportMove, true);
    window.addEventListener('wheel', closeDropdownOnViewportMove, wheelOpts);
    window.addEventListener('touchmove', closeDropdownOnViewportMove, wheelOpts);
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('scroll', closeDropdownOnViewportMove);
    }

    function setActiveIndex(idx: number) {
      const items = dropdown.querySelectorAll<HTMLElement>('.usfm-book-code-option:not(.usfm-book-code-option--empty)');
      items.forEach((el, i) => {
        const active = i === idx;
        el.setAttribute('aria-selected', String(active));
        el.classList.toggle('usfm-book-code-option--active', active);
      });
      activeIndex = idx;
      if (idx >= 0 && items[idx]) {
        items[idx].scrollIntoView({ block: 'nearest' });
        codeInput.setAttribute('aria-activedescendant', items[idx].id);
      } else {
        codeInput.removeAttribute('aria-activedescendant');
      }
    }

    function selectCode(code: string) {
      codeInput.value = code;
      applyValidationUI(code);
      closeDropdown();
      syncCodeAttr();
      codeInput.focus();
      codeInput.select();
    }

    /* ── Input event handlers ───────────────────────────────────────────── */
    codeInput.addEventListener('focus', () => {
      openDropdown();
    });

    codeInput.addEventListener('input', () => {
      renderDropdown(codeInput.value);
      if (dropdown.hidden) openDropdown();
      syncCodeAttr(); // only syncs if value is valid
    });

    codeInput.addEventListener('blur', (e) => {
      // Dropdown options use mousedown+preventDefault so blur never fires toward them.
      // Still guard against any future focusable child in the dropdown.
      const related = e.relatedTarget as Node | null;
      if (related && dropdown.contains(related)) return;
      // Use rAF so a click on an option (which runs first) can call selectCode before we close.
      requestAnimationFrame(() => {
        if (document.activeElement === codeInput) return; // focus came back
        closeDropdown();
        syncCodeAttr(true); // flush: use UNK fallback if still invalid
      });
    });

    codeInput.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (dropdown.hidden) openDropdown();
          const max = currentOptions.length - 1;
          setActiveIndex(Math.min(activeIndex + 1, max));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (activeIndex <= 0) {
            setActiveIndex(-1);
          } else {
            setActiveIndex(activeIndex - 1);
          }
          break;
        }
        case 'Enter': {
          if (!dropdown.hidden && activeIndex >= 0 && currentOptions[activeIndex]) {
            e.preventDefault();
            selectCode(currentOptions[activeIndex][0]);
          } else if (!dropdown.hidden && currentOptions.length === 1) {
            e.preventDefault();
            selectCode(currentOptions[0][0]);
          } else {
            closeDropdown();
          }
          break;
        }
        case 'Escape': {
          if (!dropdown.hidden) {
            e.preventDefault();
            closeDropdown();
          }
          break;
        }
        case 'Tab': {
          // Select highlighted item on Tab if dropdown is open.
          if (!dropdown.hidden && activeIndex >= 0 && currentOptions[activeIndex]) {
            e.preventDefault();
            selectCode(currentOptions[activeIndex][0]);
          } else {
            closeDropdown();
          }
          break;
        }
        case 'ArrowRight': {
          const len = codeInput.value.length;
          const start = codeInput.selectionStart ?? 0;
          const end = codeInput.selectionEnd ?? 0;
          if (start !== end || end < len) break;
          e.preventDefault();
          closeDropdown();
          const p = getPos();
          if (p === undefined) break;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p + 1)));
          view.focus();
          break;
        }
        case 'ArrowLeft': {
          if ((codeInput.selectionStart ?? 0) !== 0 || (codeInput.selectionEnd ?? 0) !== 0) break;
          e.preventDefault();
          closeDropdown();
          const p = getPos();
          if (p === undefined) break;
          try {
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(p), -1))
            );
          } catch {
            /* ignore */
          }
          view.focus();
          break;
        }
      }
    });

    /* ── ArrowLeft on PM view → enter the combobox ──────────────────────── */
    // IMPORTANT: use capture phase so this fires BEFORE PM's own keydown listener
    // (which runs in the bubbling phase). If we ran in the bubbling phase, PM would
    // have already moved the cursor by the time we check view.state.selection, so
    // selection.$from.pos would no longer equal p + 1 and we'd always return early.
    const handleViewKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft') return;
      const { selection } = view.state;
      if (!(selection instanceof TextSelection) || !selection.empty) return;
      const p = getPos();
      if (p === undefined) return;
      if (selection.$from.pos !== p + 1) return;
      // Prevent PM from processing this ArrowLeft (which would move cursor before book).
      e.preventDefault();
      e.stopImmediatePropagation();
      codeInput.focus();
      codeInput.setSelectionRange(codeInput.value.length, codeInput.value.length);
    };
    view.dom.addEventListener('keydown', handleViewKeyDown, { capture: true });

    /* ── NodeView interface ──────────────────────────────────────────────── */
    return {
      dom,
      contentDOM: contentSpan,

      update(updated) {
        if (updated.type.name !== 'book') return false;
        node = updated;
        const c = String(updated.attrs.code ?? 'UNK');
        dom.setAttribute('data-code', c);
        dom.setAttribute('contenteditable', 'false');
        contentSpan.setAttribute('contenteditable', 'true');
        // Don't overwrite the input while it (or the dropdown) is focused.
        if (combobox.contains(document.activeElement)) return true;
        // Don't replace a user-cleared empty input with "UNK" (keep the error visible).
        if (c === 'UNK' && codeInput.value === '') return true;
        if (codeInput.value !== c) {
          codeInput.value = c;
          applyValidationUI(c);
        }
        return true;
      },

      stopEvent(e) {
        // Stop events inside combobox from reaching PM (avoids view.dom.focus() stealing
        // focus from the input). Outer `dom` is already contenteditable=false; this
        // remains a safety net for bubbling from the input.
        return combobox.contains(e.target as Node);
      },

      ignoreMutation(mutation) {
        const t = mutation.target as Node | null;
        if (t && t.nodeType === 1) {
          if (combobox.contains(t as Element) || dropdown.contains(t as Element)) return true;
        }
        return false;
      },

      destroy() {
        view.dom.removeEventListener('keydown', handleViewKeyDown, { capture: true });
        for (const t of scrollTargets) {
          t.removeEventListener('scroll', closeDropdownOnViewportMove, true);
        }
        document.removeEventListener('scroll', closeDropdownOnViewportMove, true);
        window.removeEventListener('wheel', closeDropdownOnViewportMove, wheelOpts);
        window.removeEventListener('touchmove', closeDropdownOnViewportMove, wheelOpts);
        if (visualViewport) {
          visualViewport.removeEventListener('scroll', closeDropdownOnViewportMove);
        }
        closeDropdown();
        dropdown.remove();
      },
    };
  };
}
