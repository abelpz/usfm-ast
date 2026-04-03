import type { InputMode } from './convert';

/** Default editor content when switching input format (replaces previous text). */
export const SAMPLE_BY_MODE: Record<InputMode, string> = {
  usfm: `\\id MRK EN unfoldingWord® Simplified Text
\\usfm 3.0
\\ide UTF-8
\\h Mark
\\c 1
\\p
\\v 1 This is the Good News about Jesus Christ, the Son of God.
\\p
\\q1 “God said, ‘I will send my messenger
\\q2 to open the way for you.’”
`,
  usj: `{
  "type": "USJ",
  "version": "3.1",
  "content": [
    {
      "type": "book",
      "marker": "id",
      "code": "MRK",
      "content": ["EN unfoldingWord® Simplified Text"]
    },
    {
      "type": "chapter",
      "marker": "c",
      "number": "1",
      "sid": "MRK 1"
    },
    {
      "type": "para",
      "marker": "p",
      "content": [
        { "type": "verse", "marker": "v", "number": "1", "sid": "MRK 1:1" },
        "This is the Good News about Jesus Christ, the Son of God."
      ]
    }
  ]
}
`,
  usx: `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="MRK" style="id">EN unfoldingWord® Simplified Text</book>
  <chapter number="1" style="c" sid="MRK 1" />
  <para style="p">
    <verse number="1" style="v" sid="MRK 1:1" />
    This is the Good News about Jesus Christ, the Son of God.
  </para>
</usx>
`,
};
