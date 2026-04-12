import type { EditorMode, EditorSection } from '@usfm-tools/editor';

import type { WysiwygToolbarIcon } from './bubble-context';

/**
 * Optional hooks to localize labels, icons, and simplified-mode chrome for {@link attachWysiwygChrome}.
 * Unspecified methods fall back to the built-in docs-style presentation.
 */
export interface PresentationLayer {
  markerLabel?(marker: string, section: EditorSection, mode: EditorMode): string;
  menuCategory?(category: string | undefined, mode: EditorMode): string | undefined;
  /** Return custom markup or an element; `null`/`undefined` falls back to default Lucide bucket icons. */
  markerIcon?(marker: string): string | HTMLElement | null | undefined;
  bubbleIcon?(icon: WysiwygToolbarIcon | string): string | HTMLElement;
  structuralRow?(
    id: string
  ): { label: string; icon: string | HTMLElement; ariaLabel: string } | null;
  isSimplifiedMode?(mode: EditorMode): boolean;
  paletteAriaLabel?(mode: EditorMode): string;
  palettePlaceholder?(mode: EditorMode, triggerKey: string): string;
  /** Heading above the “turn into” / marker-type menu. */
  blockMenuTitle?(mode: EditorMode): string;
  /** SVG string for the gutter ⋮ handle in simplified modes. */
  gutterBlockOptionsIconSvg?(): string;
}

export type ResolvedPresentationLayer = Required<PresentationLayer>;
