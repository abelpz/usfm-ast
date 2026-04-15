/** Replace `{book}` with upper-case USFM book code (e.g. `twl_{book}.tsv` → `twl_TIT.tsv`). */
export function formatHelpsPathTemplate(tpl: string, bookCode: string): string {
  return tpl.replace(/\{book\}/gi, bookCode.trim().toUpperCase());
}
