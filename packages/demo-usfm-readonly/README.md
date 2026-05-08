# Demo — `@usfm-tools/usfm-readonly-react`

Mini **Vite + React** app to exercise the read-only USFM reader (verse, `\\w` word clicks, selection, `stripAlignment`).

## Run (monorepo root)

```bash
bun install
bun run build --filter=@usfm-tools/usfm-readonly-react
bun run dev --filter=demo-usfm-readonly
```

Opens [http://localhost:4180](http://localhost:4180) when Vite can launch the browser.

Sample USFM is loaded from `packages/usfm-parser/tests/fixtures/usfm/jonah.bsb.usfm`.

## Production build

```bash
bun run build --filter=demo-usfm-readonly
bun run preview --filter=demo-usfm-readonly
```

Preview listens on port **4181** (see `package.json`).
