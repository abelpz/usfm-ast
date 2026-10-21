import { readFile } from 'fs/promises';
import { degrees, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { extname } from 'path';

/**
 * Embed a JPEG or PNG image into a PDFDocument and return the embedded image.
 */
async function embedImage(doc: PDFDocument, imagePath: string) {
  const bytes = await readFile(imagePath);
  const ext = extname(imagePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return doc.embedJpg(bytes);
  if (ext === '.png') return doc.embedPng(bytes);
  throw new Error(
    `Unsupported cover image format "${ext}". Supply a JPEG (.jpg/.jpeg) or PNG (.png) file.`,
  );
}

/**
 * Prepend a **booklet cover spread** to an existing PDF.
 *
 * ## Saddle-stitch 2-up layout
 *
 * PTXprint's 2-up booklet pages are stored in the PDF as portrait pages
 * (MediaBox ≈ 598 × 845 pt) with `Rotate=90`, which makes them display as
 * A4 landscape (845 × 598 pt) in PDF viewers.  Each landscape page shows
 * **two A5 portrait slots side-by-side**:
 *
 * - Left slot (display x = 0 → H/2)  = one content page
 * - Right slot (display x = H/2 → H) = next content page
 *
 * The **front cover** of a saddle-stitch booklet is the right slot of the
 * FIRST sheet.
 *
 * ## Cover spread page
 *
 * This function prepends an A4 landscape page (NO rotation — naturally
 * landscape) so PDF viewers show it correctly without any rotation:
 *
 * - Left half  = blank white  (back cover placeholder)
 * - Right half = cover image  (front cover, full-bleed A5 slot)
 *
 * The cover spread page uses the same displayed dimensions as the content
 * pages (A4 landscape, displayed size ≈ 297 × 210 mm) so the transition
 * looks seamless.
 *
 * @param pdfBytes           - Existing imposed booklet PDF.
 * @param frontImagePath     - JPEG or PNG path for the front cover (right slot).
 * @param pagesPerSpread     - 1 = single-page output; 2 = booklet spread.
 * @param backImagePath      - Optional JPEG or PNG for the back cover (left slot).
 *                             Only used when `pagesPerSpread >= 2`.
 * @returns New PDF Uint8Array with cover page(s) prepended.
 */
export async function prependCoverPage(
  pdfBytes: Uint8Array,
  frontImagePath: string,
  pagesPerSpread = 1,
  backImagePath?: string,
): Promise<Uint8Array> {
  const contentDoc = await PDFDocument.load(pdfBytes);
  const mergedDoc = await PDFDocument.create();

  const frontImg = await embedImage(mergedDoc, frontImagePath);
  const backImg = backImagePath ? await embedImage(mergedDoc, backImagePath) : null;

  if (pagesPerSpread >= 2) {
    // Booklet mode: create an A4 landscape cover spread.
    // Content pages are stored as portrait (598×845 pt) with Rotate=90
    // which DISPLAYS as landscape (845×598 pt).
    // We create a native landscape page so no rotation transform is needed.
    const firstContent = contentDoc.getPage(0);
    const { width: W, height: H } = firstContent.getSize();

    // Displayed dimensions: landscape width = H, landscape height = W
    const dispW = H; // ≈ 845 pt (≈ 297 mm)
    const dispH = W; // ≈ 598 pt (≈ 210 mm)

    const spread = mergedDoc.addPage([dispW, dispH]); // native landscape, Rotate=0

    // Left half = back cover slot
    if (backImg) {
      spread.drawImage(backImg, {
        x: 0,
        y: 0,
        width:  dispW / 2,
        height: dispH,
      });
    }

    // Right half = front cover slot
    spread.drawImage(frontImg, {
      x: dispW / 2,
      y: 0,
      width:  dispW / 2,
      height: dispH,
    });
  } else {
    // Single-page mode: plain full-page cover matching the first content page.
    const firstContent = contentDoc.getPage(0);
    const { width, height } = firstContent.getSize();
    const coverPage = mergedDoc.addPage([width, height]);

    // Copy Rotate from the content page so the cover orientation matches.
    const srcRotate = firstContent.node.get(PDFName.of('Rotate'));
    if (srcRotate instanceof PDFNumber && srcRotate.asNumber() !== 0) {
      coverPage.setRotation(degrees(srcRotate.asNumber()));
    }

    coverPage.drawImage(frontImg, { x: 0, y: 0, width, height });
  }

  const contentPageIndices = contentDoc.getPageIndices();
  const copiedContent = await mergedDoc.copyPages(contentDoc, contentPageIndices);
  for (const page of copiedContent) {
    mergedDoc.addPage(page);
  }

  return mergedDoc.save();
}
