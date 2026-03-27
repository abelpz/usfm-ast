import { defaultMarkers, syntaxByType } from './markers';
import { MarkerSyntaxDefinition, USFMMarkerInfo, UsfmStyleType } from './types';

/**
 * Registry for USFM (Unified Standard Format Markers) markers.
 * Implements a singleton pattern to ensure only one instance exists.
 */
export class USFMMarkerRegistry {
  private static instance: USFMMarkerRegistry;

  /** USFM marker tokens are short; reject oversize input before any scanning. */
  private static readonly MAX_MARKER_STRING_LENGTH = 128;

  /** Longest first so `thr` wins over `th`, etc. */
  private static readonly TABLE_PREFIXES = ['thr', 'tcr', 'thc', 'tcc', 'th', 'tc'] as const;

  private static readonly DEFAULT_MARKERS = defaultMarkers;

  private static isAsciiLetter(ch: string): boolean {
    const c = ch.charCodeAt(0);
    return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
  }

  private static isAsciiDigit(ch: string): boolean {
    const c = ch.charCodeAt(0);
    return c >= 0x30 && c <= 0x39;
  }

  /** `(th|tc|thr|tcr|thc|tcc)(\d+)(-(\d+))?$` without backtracking regex. */
  private static matchTableCellMarker(marker: string): { prefix: string } | null {
    for (const prefix of USFMMarkerRegistry.TABLE_PREFIXES) {
      if (!marker.startsWith(prefix)) continue;
      const rest = marker.slice(prefix.length);
      if (USFMMarkerRegistry.matchTableCellNumericSuffix(rest)) {
        return { prefix };
      }
    }
    return null;
  }

  private static matchTableCellNumericSuffix(s: string): boolean {
    const n = s.length;
    let i = 0;
    if (i >= n || !USFMMarkerRegistry.isAsciiDigit(s[i])) return false;
    while (i < n && USFMMarkerRegistry.isAsciiDigit(s[i])) i++;
    if (i === n) return true;
    if (s[i] !== '-') return false;
    i++;
    const start = i;
    while (i < n && USFMMarkerRegistry.isAsciiDigit(s[i])) i++;
    return i === n && i > start;
  }

  /**
   * `([a-zA-Z]+-?[a-zA-Z]*)(\d*)(-[se])?$` without polynomial-time regex.
   * Covers basic / numbered / milestone-style marker ids (e.g. p, mt1, qt1-s, qt-s).
   */
  private static parseGenericMarkerForm(marker: string): {
    baseMarker: string;
    level: string;
    milestoneSuffix: string | undefined;
  } | null {
    const n = marker.length;
    let i = 0;
    if (i >= n || !USFMMarkerRegistry.isAsciiLetter(marker[i])) return null;
    while (i < n && USFMMarkerRegistry.isAsciiLetter(marker[i])) i++;
    if (i < n && marker[i] === '-') {
      i++;
      while (i < n && USFMMarkerRegistry.isAsciiLetter(marker[i])) i++;
    }
    const baseMarker = marker.slice(0, i);
    const digitStart = i;
    while (i < n && USFMMarkerRegistry.isAsciiDigit(marker[i])) i++;
    const level = marker.slice(digitStart, i);
    let milestoneSuffix: string | undefined;
    if (i < n) {
      if (marker[i] !== '-') return null;
      i++;
      if (i >= n || (marker[i] !== 's' && marker[i] !== 'e')) return null;
      milestoneSuffix = marker.slice(i - 1, i + 1);
      i++;
    }
    if (i !== n) return null;
    return { baseMarker, level, milestoneSuffix };
  }

  private static isWellFormedMarkerSyntax(marker: string): boolean {
    return (
      USFMMarkerRegistry.matchTableCellMarker(marker) !== null ||
      USFMMarkerRegistry.parseGenericMarkerForm(marker) !== null
    );
  }

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
      const tableCell = USFMMarkerRegistry.matchTableCellMarker(markerToLookup);
      if (tableCell) {
        const { prefix } = tableCell;
        // Look up the base pattern (e.g., 'tcr1' for 'tcr1-2')
        const baseKey = prefix + '1';
        const baseInfo = this.markerData[baseKey];
        if (baseInfo) {
          // Apply the same merging logic for table cells
          const fallbackProps = syntaxByType[baseInfo.type];
          return fallbackProps ? ({ ...fallbackProps, ...baseInfo } as USFMMarkerInfo) : baseInfo;
        }
      }

      const parsed = USFMMarkerRegistry.parseGenericMarkerForm(markerToLookup);
      if (!parsed) {
        return undefined;
      }

      const { baseMarker, level, milestoneSuffix } = parsed;
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
    if (marker.length > USFMMarkerRegistry.MAX_MARKER_STRING_LENGTH) {
      throw new Error(
        `Invalid marker format: marker exceeds maximum length (${USFMMarkerRegistry.MAX_MARKER_STRING_LENGTH})`
      );
    }
    if (!USFMMarkerRegistry.isWellFormedMarkerSyntax(marker)) {
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

    return !!this.markerData[marker] || USFMMarkerRegistry.isWellFormedMarkerSyntax(marker);
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
