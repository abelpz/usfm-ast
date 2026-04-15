/**
 * Door43 `rc://` link parsing (same shape as bt-synergy tc-study).
 * Format: rc://[lang]/[resource]/[subtype]/[path…]
 */

export interface ParsedRcLink {
  language: string;
  resourceAbbrev: string;
  resourceType: 'academy' | 'words' | 'notes' | 'questions' | 'unknown';
  entryId: string;
  isValid: boolean;
  scriptureRef?: {
    bookCode: string;
    chapter: string;
    verse: string;
  };
}

export function parseRcLink(href: string): ParsedRcLink {
  const invalid: ParsedRcLink = {
    language: '',
    resourceAbbrev: '',
    resourceType: 'unknown',
    entryId: '',
    isValid: false,
  };

  if (!href || !href.startsWith('rc://')) {
    return invalid;
  }

  try {
    const path = href.substring(5);
    const parts = path.split('/');

    if (parts.length < 4) {
      return invalid;
    }

    const [language, resourceAbbrev, resourceSubtype, ...pathParts] = parts;

    let resourceType: ParsedRcLink['resourceType'] = 'unknown';
    if (resourceAbbrev === 'ta') {
      resourceType = 'academy';
    } else if (resourceAbbrev === 'tw') {
      resourceType = 'words';
    } else if (resourceAbbrev === 'tn') {
      resourceType = 'notes';
    } else if (resourceAbbrev === 'tq') {
      resourceType = 'questions';
    }

    let entryId = pathParts.join('/');

    if (resourceType === 'academy' && resourceSubtype === 'man') {
      entryId = pathParts.join('/');
    } else if (resourceType === 'words' && resourceSubtype === 'dict') {
      entryId = pathParts.join('/');
    } else {
      entryId = [resourceSubtype, ...pathParts].join('/');
    }

    let scriptureRef: ParsedRcLink['scriptureRef'] = undefined;
    if (resourceType === 'notes' && pathParts.length >= 3) {
      scriptureRef = {
        bookCode: pathParts[0]!,
        chapter: pathParts[1]!,
        verse: pathParts[2]!,
      };
    }

    return {
      language: language ?? '',
      resourceAbbrev: resourceAbbrev ?? '',
      resourceType,
      entryId,
      scriptureRef,
      isValid: true,
    };
  } catch {
    return invalid;
  }
}

export function isRelativeLink(href: string): boolean {
  return href.startsWith('../') || href.startsWith('./');
}

export function parseRelativeLink(href: string, currentEntryId: string): string {
  if (!href || !isRelativeLink(href)) {
    return href;
  }

  let path = href;
  const upLevels = (href.match(/\.\.\//g) || []).length;
  path = path.replace(/^(\.\.\/)*(\.\/)?/, '');

  if (currentEntryId && upLevels > 0) {
    const currentParts = currentEntryId.split('/');
    const currentDirParts = currentParts.length > 1 ? currentParts.slice(0, -1) : currentParts;
    const baseParts = currentDirParts.slice(0, Math.max(0, currentDirParts.length - upLevels));
    const resolved = [...baseParts, path].join('/');
    return resolved.endsWith('.md') ? resolved.slice(0, -3) : resolved;
  }

  const pathResolved = path.endsWith('.md') ? path.slice(0, -3) : path;
  return pathResolved;
}

export function getRcLinkDisplayName(parsed: ParsedRcLink): string {
  if (!parsed.isValid || !parsed.entryId) {
    return 'Unknown';
  }

  const parts = parsed.entryId.split('/');
  const lastPart = parts[parts.length - 1] ?? '';

  return lastPart
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Map an rc href to TW/TA article id used by Door43 raw paths (after dict/man strip). */
export function rcHrefToTwTaArticle(href: string): { kind: 'ta' | 'tw'; id: string } | null {
  const p = parseRcLink(href);
  if (!p.isValid) return null;
  if (p.resourceType === 'academy') return { kind: 'ta', id: p.entryId };
  if (p.resourceType === 'words') return { kind: 'tw', id: p.entryId };
  return null;
}

/** Every `rc://…` token in markdown (plain or markdown links) for title prefetch. */
export function extractRcHrefs(text: string): string[] {
  const re = /rc:\/\/[^\s)\]}\n>]+/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]!);
  }
  return out;
}
