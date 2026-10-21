const SAMPLE_JHN = String.raw`\id JHN
\ide UTF-8
\h Gospel according to John
\mt1 John
\c 1
\p
\v 1 In the beginning was the Word, and the Word was with God, and the Word was God.
`;

// ── UI refs ────────────────────────────────────────────────────────────────
const btn = document.querySelector('#btn');
const addBookBtn = document.querySelector('#addBook');
const bookListEl = document.querySelector('#bookList');
const statusEl = document.querySelector('#status');
const errEl = document.querySelector('#err');
const viewerWrap = document.querySelector('#viewer-wrap');
const viewer = document.querySelector('#viewer');

const paperEl = document.querySelector('#paper');
const columnsEl = document.querySelector('#columns');
const marginsEl = document.querySelector('#margins');
const rtlEl = document.querySelector('#rtl');
const mirrorMarginsEl = document.querySelector('#mirrorMargins');
const langEl = document.querySelector('#lang');
const fontEl = document.querySelector('#font');
const fontsizeEl = document.querySelector('#fontsize');
const linespacingEl = document.querySelector('#linespacing');
const pageNumbersEl = document.querySelector('#pageNumbers');
const startPageNumEl = document.querySelector('#startPageNum');
const filenameEl = document.querySelector('#filename');
const rawCfgEl = document.querySelector('#rawCfg');

// ── Dynamic book list ──────────────────────────────────────────────────────
let bookCounter = 0;

function addBook(initialValue = '') {
  bookCounter += 1;
  const id = `book-${bookCounter}`;
  const entry = document.createElement('div');
  entry.className = 'book-entry';
  entry.dataset.bookId = id;

  const header = document.createElement('div');
  header.className = 'book-entry-header';
  header.innerHTML = `<strong>Libro ${bookCounter}</strong><span class="book-id-badge"></span>`;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove';
  removeBtn.textContent = '✕ Eliminar';
  removeBtn.addEventListener('click', () => {
    entry.remove();
    renumberBooks();
  });
  header.appendChild(removeBtn);

  const textarea = document.createElement('textarea');
  textarea.rows = 10;
  textarea.spellcheck = false;
  textarea.value = initialValue;
  textarea.placeholder = '\\id XXX\n\\c 1\n\\p\n\\v 1 …';

  // Live-update the badge showing detected book ID
  const badge = header.querySelector('.book-id-badge');
  const updateBadge = () => {
    const m = textarea.value.match(/^\\id\s+(\S+)/m);
    badge.textContent = m ? `(${m[1]})` : '';
  };
  textarea.addEventListener('input', updateBadge);
  updateBadge();

  entry.appendChild(header);
  entry.appendChild(textarea);
  bookListEl.appendChild(entry);
}

function renumberBooks() {
  bookListEl.querySelectorAll('.book-entry').forEach((el, i) => {
    el.querySelector('.book-entry-header strong').textContent = `Libro ${i + 1}`;
  });
}

addBook(SAMPLE_JHN);
addBookBtn.addEventListener('click', () => addBook());

// ── Generate PDF ───────────────────────────────────────────────────────────
let lastUrl = null;

btn?.addEventListener('click', async () => {
  errEl.classList.add('hidden');
  errEl.textContent = '';
  viewerWrap.classList.add('hidden');
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }

  const usfms = Array.from(bookListEl.querySelectorAll('textarea'))
    .map((ta) => ta.value.trim())
    .filter(Boolean);

  if (!usfms.length) {
    errEl.textContent = 'Añade al menos un libro USFM con una línea \\id.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  statusEl.textContent = 'Generando PDF… (XeTeX puede tardar varios segundos)';

  try {
    const body = {
      usfms,
      paperSize: paperEl.value,
    };

    const columns = parseInt(columnsEl?.value ?? '1', 10);
    if (columns === 2) body.columns = 2;
    if (rtlEl?.checked) body.rtl = true;
    if (mirrorMarginsEl?.checked) body.mirrorMargins = true;

    const margins = parseFloat(marginsEl?.value ?? '');
    if (!isNaN(margins) && marginsEl.value.trim() !== '') body.marginsMm = margins;

    const lang = langEl.value.trim();
    if (lang) body.langIso = lang;

    const font = fontEl?.value?.trim();
    if (font) body.fontFamily = font;

    const fontSize = parseFloat(fontsizeEl?.value ?? '');
    if (!isNaN(fontSize) && fontsizeEl.value.trim() !== '') body.fontSizePt = fontSize;

    const lineSpacing = parseFloat(linespacingEl?.value ?? '');
    if (!isNaN(lineSpacing) && linespacingEl.value.trim() !== '') body.lineSpacingPt = lineSpacing;

    body.pageNumbers = pageNumbersEl.value;

    const startPage = parseInt(startPageNumEl?.value ?? '', 10);
    if (!isNaN(startPage) && startPageNumEl.value.trim() !== '') body.startPageNum = startPage;

    const customFilename = filenameEl?.value?.trim();
    if (customFilename) body.filename = customFilename;

    const rawCfg = rawCfgEl?.value?.trim();
    if (rawCfg) body.rawCfg = rawCfg;

    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const parts = [j.error || res.statusText, j.name && `(${j.name})`, j.code != null && `code=${j.code}`]
        .filter(Boolean)
        .join(' ');
      const tempHint =
        typeof j.tempDir === 'string' && j.tempDir.trim()
          ? `\n(temp: ${j.tempDir.trim()})`
          : '';
      throw new Error(parts + tempHint + (j.log ? `\n\n--- log ---\n${j.log}` : ''));
    }

    const blob = await res.blob();
    lastUrl = URL.createObjectURL(blob);
    viewer.src = lastUrl;
    viewerWrap.classList.remove('hidden');

    // Update the download link on the viewer heading with the resolved filename
    const resolvedName = res.headers.get('X-Filename') || 'usfm.pdf';
    const dlLink = document.querySelector('#download-link');
    if (dlLink) {
      dlLink.href = lastUrl;
      dlLink.download = resolvedName;
      dlLink.textContent = `⬇ ${resolvedName}`;
    }

    const bk = res.headers.get('X-Book-Code') || '?';
    const logChars = res.headers.get('X-Log-Chars') || '?';
    statusEl.textContent = `Listo · ${bk} · log ~${logChars} caracteres`;
  } catch (e) {
    errEl.textContent = e instanceof Error ? e.message : String(e);
    errEl.classList.remove('hidden');
    statusEl.textContent = 'Error';
  } finally {
    btn.disabled = false;
  }
});
