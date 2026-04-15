export interface ResourceDependency {
  resourceType: string;
  language?: string;
  owner?: string;
  sameLanguage?: boolean;
  sameOwner?: boolean;
}

export interface ResourceMetadata {
  subject?: string;
  language?: string;
  identifier?: string;
  owner?: string;
}

export interface HelpLink {
  type: 'tw' | 'ta' | 'custom';
  id: string;
  displayText: string;
}

/** Where a TN/TWL row anchors in scripture (unfoldingWord `Reference` column). */
export type HelpRefSegment = 'verse' | 'bookIntro' | 'chapterIntro';

export interface HelpEntry {
  id: string;
  resourceType: string;
  ref: {
    chapter: number;
    verse: number;
    /**
     * `front:intro` → book introduction; `N:intro` → chapter N pre-\\v material.
     * Omitted for normal `chapter:verse` rows.
     */
    segment?: HelpRefSegment;
  };
  origWords: string;
  occurrence: number;
  content: string;
  links?: HelpLink[];
}

export interface ResourceLoader {
  resourceType: string;
  canHandle(metadata: ResourceMetadata): boolean;
  loadContent(resourceKey: string, bookCode: string): Promise<HelpEntry[]>;
}

export type ResourceLoaderConstructor = new () => ResourceLoader;

export interface ResourceTypeDefinition {
  id: string;
  displayName: string;
  subjects: string[];
  dependencies?: ResourceDependency[];
  loader: ResourceLoaderConstructor;
}

export interface TokenAnnotation {
  tokenIndex: number;
  entries: HelpEntry[];
}
