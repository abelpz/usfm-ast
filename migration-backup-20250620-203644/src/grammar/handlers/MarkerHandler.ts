import { MarkerType, MarkerTypeEnum } from '../index';
import { USFMMarkerInfo } from '../constants/types';
import { USFMMarkerRegistry } from '../constants/USMMarkersRegistry';

export class MarkerHandler {
  private markerRegistry: USFMMarkerRegistry;

  constructor(customMarkers?: Record<string, USFMMarkerInfo>) {
    this.markerRegistry = USFMMarkerRegistry.getInstance(customMarkers);
  }

  getMarkerInfo(marker: string): USFMMarkerInfo | undefined {
    return this.markerRegistry.getMarkerInfo(marker);
  }

  cleanMarkerSuffix(marker: string): string {
    let cleanMarker = marker;

    if (cleanMarker.endsWith('-s') || cleanMarker.endsWith('-e')) {
      cleanMarker = cleanMarker.slice(0, -2);
    }

    if (cleanMarker.match(/\w\d$/)) {
      cleanMarker = cleanMarker.slice(0, -1);
    }

    return cleanMarker;
  }

  determineCustomMarkerType(
    marker: string,
    isMilestone: boolean,
    hasLineBreakBefore: boolean
  ): MarkerType {
    if (isMilestone) {
      return MarkerTypeEnum.MILESTONE;
    }

    if (!hasLineBreakBefore) {
      return MarkerTypeEnum.CHARACTER;
    }

    return MarkerTypeEnum.PARAGRAPH;
  }

  handleCustomMarker(
    marker: string,
    isMilestone: boolean,
    hasLineBreakBefore: boolean
  ): USFMMarkerInfo | undefined {
    const markerType = this.determineCustomMarkerType(marker, isMilestone, hasLineBreakBefore);
    let markerInfo: USFMMarkerInfo | undefined;

    switch (markerType) {
      case MarkerTypeEnum.CHARACTER:
        markerInfo = { type: MarkerTypeEnum.CHARACTER };
        break;
      case MarkerTypeEnum.MILESTONE:
        markerInfo = { type: MarkerTypeEnum.MILESTONE };
        break;
      case MarkerTypeEnum.PARAGRAPH:
        markerInfo = { type: MarkerTypeEnum.PARAGRAPH };
        break;
    }

    if (markerInfo) {
      this.markerRegistry.addMarker(marker, markerInfo);
    }

    return markerInfo;
  }
}
