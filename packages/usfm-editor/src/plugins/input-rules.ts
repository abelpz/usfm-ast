import { InputRule, inputRules } from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';

/**
 * Typing `\\v N ` at end of line inserts a verse atom (basic heuristic).
 */
export function usfmInputRules(schema: Schema) {
  const rules: InputRule[] = [
    new InputRule(/\\v\s+(\d+)\s$/, (state, match, start, end) => {
      const n = match[1] ?? '1';
      const v = schema.nodes.verse;
      if (!v) return null;
      const node = v.create({
        number: n,
        sid: null,
        altnumber: null,
        pubnumber: null,
      });
      return state.tr.replaceWith(start, end, node);
    }),
    new InputRule(
      /\\(p|m|mi|nb|pc|pr|pm|pmo|pmc|pmr|pi|po|cls|q|q1|q2|q3|s|s1|s2|s3|s4|r|d|sp|ms|mr|cd|cl|ip|ili|io|iq|lh|li|lf)\s$/,
      (state, match, start, end) => {
      const marker = match[1] ?? 'p';
      const { $from } = state.selection;
      let depth = $from.depth;
      while (depth > 0 && $from.node(depth).type.name !== 'paragraph') depth--;
      if (depth === 0) return null;
      const tr = state.tr.delete(start, end).setNodeMarkup($from.before(depth), undefined, {
        ...$from.node(depth).attrs,
        marker,
      });
      return tr;
    }),
  ];
  return inputRules({ rules });
}
