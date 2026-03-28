/**
 * Structural validation for USJ JSON produced by {@link @usfm-tools/parser} and similar tools.
 * This is not a full USJ schema check; it asserts a well-formed tree (typed nodes, JSON shape).
 */

export type UsjValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const MAX_DEPTH = 256;
const MAX_NODES = 1_000_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates that `value` looks like a USJ document: root `type: "USJ"`, `version`, `content` array,
 * and recursively that each object node has a non-empty `type` string. String leaves in `content`
 * are allowed.
 */
export function validateUsjStructure(value: unknown): UsjValidationResult {
  const errors: string[] = [];
  let nodeCount = 0;

  function walk(node: unknown, jsonPath: string, depth: number): void {
    if (depth > MAX_DEPTH) {
      errors.push(`${jsonPath}: nesting exceeds ${MAX_DEPTH} levels`);
      return;
    }
    nodeCount += 1;
    if (nodeCount > MAX_NODES) {
      errors.push('document exceeds maximum node count');
      return;
    }

    if (node === null || node === undefined) {
      errors.push(`${jsonPath}: unexpected ${node === null ? 'null' : 'undefined'}`);
      return;
    }
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      return;
    }
    if (Array.isArray(node)) {
      errors.push(`${jsonPath}: unexpected array (use object nodes or string leaves inside parent content)`);
      return;
    }
    if (!isPlainObject(node)) {
      errors.push(`${jsonPath}: unsupported value type`);
      return;
    }

    const t = node.type;
    if (typeof t !== 'string' || t.length === 0) {
      errors.push(`${jsonPath}: missing or invalid "type"`);
    }

    if (!('content' in node) || node.content === undefined) {
      return;
    }

    const { content } = node;
    if (typeof content === 'string') {
      return;
    }
    if (!Array.isArray(content)) {
      errors.push(`${jsonPath}.content: expected array or string`);
      return;
    }

    content.forEach((child, i) => {
      walk(child, `${jsonPath}.content[${i}]`, depth + 1);
    });
  }

  if (!isPlainObject(value)) {
    return { ok: false, errors: ['root must be a JSON object'] };
  }

  if (value.type !== 'USJ') {
    errors.push('root.type must be "USJ"');
  }
  if (typeof value.version !== 'string') {
    errors.push('root.version must be a string');
  }
  if (!Array.isArray(value.content)) {
    errors.push('root.content must be an array');
  } else {
    value.content.forEach((child, i) => {
      walk(child, `$.content[${i}]`, 0);
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
