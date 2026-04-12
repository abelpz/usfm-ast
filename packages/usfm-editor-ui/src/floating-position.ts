/**
 * Viewport-safe positioning for fixed popovers using Floating UI.
 */

import { computePosition, flip, offset, shift, type Placement, type VirtualElement } from '@floating-ui/dom';

const VIEWPORT_PADDING = 8;

export function virtualRefFromRect(rect: DOMRect): VirtualElement {
  return {
    getBoundingClientRect() {
      return rect;
    },
  };
}

export interface PositionFixedLayerOptions {
  placement?: Placement;
  /** Gap between reference and floating (default 4). */
  offsetPx?: number;
}

/**
 * Position a fixed `floating` element relative to `reference`, flipping/shifting to stay on-screen.
 */
export async function positionFixedLayer(
  reference: Element | VirtualElement,
  floating: HTMLElement,
  options: PositionFixedLayerOptions = {}
): Promise<void> {
  const { placement = 'bottom-start', offsetPx = 4 } = options;
  floating.style.position = 'fixed';
  const { x, y } = await computePosition(reference, floating, {
    placement,
    strategy: 'fixed',
    middleware: [
      offset(offsetPx),
      flip({
        fallbackAxisSideDirection: 'start',
        fallbackPlacements: [
          'top-start',
          'bottom',
          'bottom-start',
          'bottom-end',
          'top-end',
          'right-start',
          'left-start',
        ],
      }),
      shift({ padding: VIEWPORT_PADDING, crossAxis: true }),
    ],
  });
  floating.style.left = `${Math.round(x)}px`;
  floating.style.top = `${Math.round(y)}px`;
}
