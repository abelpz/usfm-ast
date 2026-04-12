export type { PresentationLayer, ResolvedPresentationLayer } from './presentation';
export {
  createDocsPresentationLayer,
  docsIconKeyForParagraphMarker,
  mergePresentationLayer,
  menuIconSvg,
} from './docs-presentation';
export type { DocsMenuIconKey } from './docs-ui-types';

export type {
  ResolveWysiwygBubbleActions,
  WysiwygBubbleAction,
  WysiwygBubbleContext,
  WysiwygToolbarIcon,
} from './bubble-context';
export { buildWysiwygBubbleContext } from './bubble-context';

export { positionFixedLayer, virtualRefFromRect } from './floating-position';
export type { PositionFixedLayerOptions } from './floating-position';

export { mountConflictReview } from './conflict-review';

export type { WysiwygChromeHandle, WysiwygChromeOptions } from './wysiwyg-chrome';
export {
  attachWysiwygChrome,
  defaultWysiwygBubbleActions,
  docsWysiwygBubbleActions,
  readEditorMode,
  writeEditorMode,
} from './wysiwyg-chrome';
