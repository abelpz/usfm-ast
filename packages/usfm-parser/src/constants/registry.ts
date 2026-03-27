import { defaultMarkers, syntaxByType } from './markers';
import { MarkerSyntaxDefinition, USFMMarkerInfo, UsfmStyleType } from './types';

/**
 * Registry for USFM (Unified Standard Format Markers) markers.
 * Implements a singleton pattern to ensure only one instance exists.
 */
export class USFMMarkerRegistry {
  private static instance: USFMMarkerRegistry;

  /** USFM marker tokens are short; cap length before regex work to avoid polynomial-time matching. */
  private static readonly MAX_MARKER_STRING_LENGTH = 128;

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
      if (markerToLookup.length > USFMMarkerRegistry.MAX_MARKER_STRING_LENGTH) {
        return undefined;
      }

      const info = this.markerData[markerToLookup];
      if (info) {
        // Merge with fallback properties from syntaxByType
        const fallbackProps = syntaxByType[info.type];
        if (fallbackProps) {
          // Create merged info with fallbacks for undefined properties
          const mergedInfo: any = {
            ...fallbackProps,
            ...info, // Original marker info takes precedence
          };

          // Special handling for nested objects that need deep merging
          if (fallbackProps.implicitAttributes && info.implicitAttributes) {
            mergedInfo.implicitAttributes = {
              ...fallbackProps.implicitAttributes,
              ...info.implicitAttributes,
            };
          }

          if (fallbackProps.attributes && 'attributes' in info && info.attributes) {
            mergedInfo.attributes = {
              ...fallbackProps.attributes,
              ...info.attributes,
            };
          }

          // For specialContent, prefer the explicit one but merge mergeable arrays if needed
          if (fallbackProps.specialContent && info.specialContent) {
            mergedInfo.specialContent = {
              ...fallbackProps.specialContent,
              ...info.specialContent,
            };

            // Merge mergeable arrays if both exist
            if (fallbackProps.specialContent.mergeable && info.specialContent.mergeable) {
              mergedInfo.specialContent.mergeable = [
                ...fallbackProps.specialContent.mergeable,
                ...info.specialContent.mergeable,
              ];
            }
          }

          return mergedInfo as USFMMarkerInfo;
        }
        return info;
      }

      // Check for table cell pattern first
      const tableCellMatch = markerToLookup.match(/^(th|tc|thr|tcr|thc|tcc)(\d+)(-(\d+))?$/);
      if (tableCellMatch) {
        const [, prefix] = tableCellMatch;
        // Look up the base pattern (e.g., 'tcr1' for 'tcr1-2')
        const baseKey = prefix + '1';
        const baseInfo = this.markerData[baseKey];
        if (baseInfo) {
          // Apply the same merging logic for table cells
          const fallbackProps = syntaxByType[baseInfo.type];
          return fallbackProps ? ({ ...fallbackProps, ...baseInfo } as USFMMarkerInfo) : baseInfo;
        }
      }

      const match = markerToLookup.match(USFMMarkerRegistry.MARKER_PATTERN);
      if (!match) {
        return undefined;
      }

      const [, baseMarker, level, milestoneSuffix] = match;
      const lookupKey = level && milestoneSuffix ? baseMarker + level : baseMarker;

      const baseInfo = this.markerData[lookupKey];
      if (baseInfo) {
        // Apply the same merging logic for pattern-matched markers
        const fallbackProps = syntaxByType[baseInfo.type];
        return fallbackProps ? ({ ...fallbackProps, ...baseInfo } as USFMMarkerInfo) : baseInfo;
      }

      return undefined;
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
    if (marker.length > USFMMarkerRegistry.MAX_MARKER_STRING_LENGTH) return false;

    return !!this.markerData[marker] || USFMMarkerRegistry.MARKER_PATTERN.test(marker);
  }

  /**
   * Gets the type of a marker.
   * @param marker The marker to get the type for
   */
  public getMarkerType(marker: string): string | undefined {
    return this.getMarkerInfo(marker, 'type') as string | undefined;
  }

  /**
   * Gets the syntax definition for a marker, including fallbacks from syntaxByType
   */
  public getMarkerSyntax(marker: string): MarkerSyntaxDefinition | undefined {
    const info = this.getMarkerInfo(marker);

    if (!info) {
      return undefined;
    }

    // Check if marker has explicit syntax
    if (info.syntax) {
      return info.syntax;
    }

    // Fall back to syntax from syntaxByType
    const fallbackProps = syntaxByType[info.type];
    return fallbackProps?.syntax;
  }
}
