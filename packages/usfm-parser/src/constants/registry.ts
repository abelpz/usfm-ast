import { defaultMarkers } from './markers';
import { USFMMarkerInfo } from './types';

/**
 * Registry for USFM (Unified Standard Format Markers) markers.
 * Implements a singleton pattern to ensure only one instance exists.
 */
export class USFMMarkerRegistry {
  private static instance: USFMMarkerRegistry;

  /**
   * Regular expression for validating USFM markers.
   * Matches patterns like:
   * - Basic markers: 'p', 'c', 'v'
   * - Numbered markers: 'mt1', 'imt2'
   * - Milestone markers: 'qt-s', 'qt-e'
   * - Table cell range markers: 'tcr1-2', 'th3-5'
   */
  private static readonly MARKER_PATTERN = new RegExp(
    /^([a-zA-Z]+-?[a-zA-Z]*)(\d*)(-[se])?$|^(th|tc|thr|tcr|thc|tcc)(\d+)(-(\d+))?$/
  );

  private static readonly DEFAULT_MARKERS = defaultMarkers;

  private markerData: typeof defaultMarkers = {};

  private constructor() {} // Prevent direct construction

  /**
   * Gets the singleton instance of USFMMarkerRegistry.
   * @param initialData Optional initial marker data to override defaults
   */
  public static getInstance(initialData?: typeof defaultMarkers): USFMMarkerRegistry {
    if (!USFMMarkerRegistry.instance) {
      USFMMarkerRegistry.instance = new USFMMarkerRegistry();
      USFMMarkerRegistry.instance.initializeMarkers(USFMMarkerRegistry.DEFAULT_MARKERS);

      if (initialData) {
        for (const [marker, info] of Object.entries(initialData)) {
          USFMMarkerRegistry.instance.markerData[marker] = info;
        }
      }
    }
    return USFMMarkerRegistry.instance;
  }

  private initializeMarkers(markers: typeof defaultMarkers): void {
    this.markerData = markers;
  }

  /**
   * Gets all marker information.
   * @param marker The USFM marker to look up
   */
  public getMarkerInfo(marker: string): USFMMarkerInfo | undefined;

  /**
   * Gets specific property from marker information.
   * @param marker The USFM marker to look up
   * @param property The property to retrieve
   */
  public getMarkerInfo<K extends keyof USFMMarkerInfo>(
    marker: string,
    property: K
  ): USFMMarkerInfo[K] | undefined;

  public getMarkerInfo<K extends keyof USFMMarkerInfo>(
    marker: string,
    property?: K
  ): USFMMarkerInfo | USFMMarkerInfo[K] | undefined {
    if (!marker || typeof marker !== 'string') {
      throw new Error('Invalid marker: Marker must be a non-empty string');
    }

    function lookupMarkerInfo(
      this: USFMMarkerRegistry,
      markerToLookup: string
    ): USFMMarkerInfo | undefined {
      const info = this.markerData[markerToLookup];
      if (info) {
        return info;
      }

      // Check for table cell pattern first
      const tableCellMatch = markerToLookup.match(/^(th|tc|thr|tcr|thc|tcc)(\d+)(-(\d+))?$/);
      if (tableCellMatch) {
        const [, prefix] = tableCellMatch;
        // Look up the base pattern (e.g., 'tcr1' for 'tcr1-2')
        const baseKey = prefix + '1';
        return this.markerData[baseKey];
      }

      const match = markerToLookup.match(USFMMarkerRegistry.MARKER_PATTERN);
      if (!match) {
        return undefined;
      }

      const [, baseMarker, level, milestoneSuffix] = match;
      const lookupKey = level && milestoneSuffix ? baseMarker + level : baseMarker;

      return this.markerData[lookupKey];
    }

    const info = lookupMarkerInfo.call(this, marker);
    if (!info) {
      return undefined;
    }

    return property ? info[property] : info;
  }

  /**
   * Adds a new marker to the registry.
   * @param marker The USFM marker to add
   * @param info The marker information
   * @throws Error if the marker is invalid or already exists
   */
  public addMarker(marker: string, info: USFMMarkerInfo): void {
    if (!USFMMarkerRegistry.MARKER_PATTERN.test(marker)) {
      throw new Error(`Invalid marker format: ${marker}`);
    }

    if (this.markerData[marker]) {
      throw new Error(`Marker already exists: ${marker}`);
    }

    this.markerData[marker] = info;
  }

  /**
   * Checks if a marker is valid according to USFM syntax rules.
   * @param marker The marker to validate
   */
  public isValidMarker(marker: string): boolean {
    if (!marker || typeof marker !== 'string') return false;

    return !!this.markerData[marker] || USFMMarkerRegistry.MARKER_PATTERN.test(marker);
  }

  /**
   * Gets the type of a marker.
   * @param marker The marker to get the type for
   */
  public getMarkerType(marker: string): string | undefined {
    return this.getMarkerInfo(marker, 'type') as string | undefined;
  }
}
