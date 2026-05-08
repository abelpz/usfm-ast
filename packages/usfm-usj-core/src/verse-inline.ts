/**
 * Find inline USJ nodes belonging to one verse (by `sid`), including text that continues
 * across paragraph siblings until the next verse milestone — same behavior the editor uses
 * for alignment and gateway flattening.
 */

function isVerseNode(x: unknown): boolean {
  return (
    x != null &&
    typeof x === 'object' &&
    (x as Record<string, unknown>).type === 'verse'
  );
}

function findVerseInlineContent(nodes: unknown[], targetSid: string): unknown[] | undefined {
  for (let ni = 0; ni < nodes.length; ni++) {
    const n = nodes[ni];
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (!Array.isArray(o.content)) continue;

    const arr = o.content as unknown[];

    let verseIdx = -1;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (
        item &&
        typeof item === 'object' &&
        (item as Record<string, unknown>).type === 'verse' &&
        (item as Record<string, unknown>).sid === targetSid
      ) {
        verseIdx = i;
        break;
      }
    }

    if (verseIdx >= 0) {
      const out: unknown[] = [];
      let hitNextVerse = false;
      for (let j = verseIdx + 1; j < arr.length; j++) {
        const x = arr[j];
        if (isVerseNode(x)) {
          hitNextVerse = true;
          break;
        }
        out.push(x);
      }

      if (!hitNextVerse) {
        outer: for (let nj = ni + 1; nj < nodes.length; nj++) {
          const sib = nodes[nj];
          if (!sib || typeof sib !== 'object') continue;
          const sibContent = (sib as Record<string, unknown>).content;
          if (!Array.isArray(sibContent)) continue;
          for (const x of sibContent as unknown[]) {
            if (isVerseNode(x)) break outer;
            out.push(x);
          }
        }
      }

      return out;
    }

    const deep = findVerseInlineContent(arr, targetSid);
    if (deep !== undefined) return deep;
  }
  return undefined;
}

/**
 * Inline nodes for a verse, spanning across paragraph boundaries.
 */
export function findVerseInlineNodes(rootContent: unknown[], targetSid: string): unknown[] {
  return findVerseInlineContent(rootContent, targetSid) ?? [];
}
