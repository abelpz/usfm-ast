/**
 * Picks the appropriate diff renderer based on the file path extension.
 *
 * - `.usfm` / `.sfm` → UsfmChapterDiffView
 * - `manifest.yaml` / `manifest.yml` → YamlKeyDiffView
 * - Everything else → PlainTextDiffView
 */

import type { FileConflict } from '@usfm-tools/types';
import { PlainTextDiffView } from './PlainTextDiffView';
import { YamlKeyDiffView } from './YamlKeyDiffView';
import { JsonKeyDiffView } from './JsonKeyDiffView';
import { UsfmChapterDiffView } from './UsfmChapterDiffView';

import type { UsfmChapterDiffViewProps } from './UsfmChapterDiffView';

/** Extra props forwarded only to the USFM renderer (nested pick callbacks). */
type UsfmPickProps = Pick<
  UsfmChapterDiffViewProps,
  | 'chapterPicks'
  | 'paragraphPicks'
  | 'versePicks'
  | 'activeChapter'
  | 'showChapterStrip'
  | 'alignmentGroupPicks'
  | 'onChapterPick'
  | 'onParagraphPick'
  | 'onVersePick'
  | 'onAlignmentGroupPick'
  | 'onActiveChapterChange'
  | 'onHunksDiscovered'
>;

export interface ConflictRendererProps extends UsfmPickProps {
  conflict: FileConflict;
  oursLabel?: string;
  theirsLabel?: string;
  baseLabel?: string;
}

function isUsfmPath(path: string): boolean {
  const l = path.toLowerCase();
  return l.endsWith('.usfm') || l.endsWith('.sfm');
}

function isYamlManifest(path: string): boolean {
  const l = path.toLowerCase().replace(/\\/g, '/');
  return l.endsWith('manifest.yaml') || l.endsWith('manifest.yml');
}

function isJsonFile(path: string): boolean {
  return path.toLowerCase().endsWith('.json');
}

export function ConflictRenderer({
  conflict,
  oursLabel,
  theirsLabel,
  baseLabel,
  chapterPicks,
  paragraphPicks,
  versePicks,
  activeChapter,
  showChapterStrip,
  alignmentGroupPicks,
  onChapterPick,
  onParagraphPick,
  onVersePick,
  onAlignmentGroupPick,
  onActiveChapterChange,
  onHunksDiscovered,
}: ConflictRendererProps) {
  const ol = oursLabel ?? conflict.oursLabel ?? 'Yours';
  const tl = theirsLabel ?? conflict.theirsLabel ?? 'Theirs';
  const bl = baseLabel ?? conflict.baseLabel ?? (conflict.baseSource === 'none' ? 'No common ancestor' : 'Base');

  const { path, oursText, theirsText, baseText, chapterIndices } = conflict;

  if (isUsfmPath(path)) {
    return (
      <UsfmChapterDiffView
        oursText={oursText}
        theirsText={theirsText}
        baseText={baseText}
        chapterIndices={chapterIndices}
        oursLabel={ol}
        theirsLabel={tl}
        baseLabel={bl}
        chapterPicks={chapterPicks}
        paragraphPicks={paragraphPicks}
        versePicks={versePicks}
        activeChapter={activeChapter}
        showChapterStrip={showChapterStrip}
        alignmentGroupPicks={alignmentGroupPicks}
        onChapterPick={onChapterPick}
        onParagraphPick={onParagraphPick}
        onVersePick={onVersePick}
        onAlignmentGroupPick={onAlignmentGroupPick}
        onActiveChapterChange={onActiveChapterChange}
        onHunksDiscovered={onHunksDiscovered}
      />
    );
  }

  if (isYamlManifest(path)) {
    return (
      <YamlKeyDiffView
        oursText={oursText}
        theirsText={theirsText}
        baseText={baseText}
        oursLabel={ol}
        theirsLabel={tl}
        baseLabel={bl}
      />
    );
  }

  if (isJsonFile(path)) {
    return (
      <JsonKeyDiffView
        oursText={oursText}
        theirsText={theirsText}
        baseText={baseText}
        oursLabel={ol}
        theirsLabel={tl}
        baseLabel={bl}
      />
    );
  }

  return (
    <PlainTextDiffView
      oursText={oursText}
      theirsText={theirsText}
      baseText={baseText !== '' ? baseText : undefined}
      oursLabel={ol}
      theirsLabel={tl}
      baseLabel={bl}
    />
  );
}
