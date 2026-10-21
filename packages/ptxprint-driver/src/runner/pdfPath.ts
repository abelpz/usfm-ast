import { join } from 'path';

/**
 * Expected PDF path after a successful `ptxprint -p … -P <projectId>` run.
 *
 * PTXprint places the PDF one level *above* the config dir:
 *   tmpdir = <projectDir>/local/ptxprint/<configId>
 *   outpath = join(tmpdir, '..', baseName)   → <projectDir>/local/ptxprint/<baseName>.pdf
 *
 * For multi-book runs PTXprint names the file `<first>-<last>` (view.py baseTeXPDFnames).
 *
 * When `pagesPerSpread > 1` PTXprint's finishing pipeline imposes the pages and saves the
 * result to a NEW file with a `_<N>up` suffix (e.g. `_2up` for saddle-stitch spreads).
 * procpdf.py sets `ext = "_{}up".format(nums)` and renames the output file.
 * We must therefore look for that suffixed file instead of the base PDF.
 */
export function expectedPdfPath(opts: {
  projectsRoot: string;
  projectId: string;
  configId: string;
  /** Single book code OR ordered list of all book codes in the job. */
  bookCode: string | string[];
  /**
   * Pages per physical spread (from `RenderOptions.pagesPerSpread`).
   * When > 1 PTXprint appends `_<N>up` to the output filename.
   */
  pagesPerSpread?: number;
}): string {
  const { projectsRoot, projectId, configId, bookCode, pagesPerSpread } = opts;
  const codes = Array.isArray(bookCode) ? bookCode : [bookCode];
  const bkSegment =
    codes.length > 1 ? `${codes[0]}-${codes[codes.length - 1]}` : codes[0];
  const imposedSuffix =
    pagesPerSpread != null && pagesPerSpread > 1 ? `_${pagesPerSpread}up` : '';
  return join(
    projectsRoot,
    projectId,
    'local',
    'ptxprint',
    `${projectId}_${configId}_${bkSegment}_ptxp${imposedSuffix}.pdf`,
  );
}
