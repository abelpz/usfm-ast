// Paragraph markers (end with space, no closing marker)
export const paragraphMarkers = new Set([
  "id", // File identification
  "ide", // Optional character encoding specification
  "h", // Header
  "toc", // Table of contents
  "toca",
  "usfm", // USFM version
  "mt", // Major title
  "ms", // Major section heading
  "p", // Paragraph
  "q", // Poetry
  "c", // Chapter number
  "s", // Section heading
  "r", // Parallel reference
  "d", // Descriptive title
  "m", // Margin paragraph
  "pi", // Indented paragraph
  "pc", // Centered paragraph
  "b", // Blank line
  "imt", "imt1", "imt2", "imt3", // Introduction major title
  "is", "is1", "is2", "is3", // Introduction section heading
  "ip", // Introduction paragraph
  "ipi", // Indented introduction paragraph
  "im", // Introduction margin paragraph
  "imi", // Indented introduction margin
  "ipq", // Introduction quote paragraph
  "imq", // Introduction margin quote
  "ipr", // Introduction right-aligned paragraph
  "iq", "iq1", "iq2", "iq3", // Introduction poetic line
  "ib", // Introduction blank line
  "ili", "ili1", "ili2", // Introduction list item
  "iot", // Introduction outline title
  "io", "io1", "io2", "io3", // Introduction outline entry
  "iex", // Introduction explanatory
  "imte", "imte1", "imte2", // Introduction major title ending
  "ie", // Introduction end
  "mt", "mt1", "mt2", "mt3", // Major title
  "mte", "mte1", "mte2", "mte3", // Major title ending
  "ms", "ms1", "ms2", "ms3", // Major section heading
  "mr", // Major section reference range
  "s", "s1", "s2", "s3", // Section heading
  "sr", // Section reference range
  "r", // Parallel passage reference
  "d", // Descriptive title
  "sp", // Speaker identification
  "sd", "sd1", "sd2", "sd3", // Semantic division
  "po", // Opening of an epistle
  "pr", // Right-aligned paragraph
  "cls", // Letter closure
  "pmo", // Embedded text opening
  "pm", // Embedded text paragraph
  "pmc", // Embedded text closing
  "pmr", // Embedded text refrain
  "pi1", "pi2", "pi3", // Indented paragraph
  "mi", // Indented flush left
  "nb", // No-break with previous paragraph
  "pc", // Centered paragraph
  "ph1", "ph2", "ph3", // Hanging indent (deprecated)
  "b", // Blank line
  "q", "q1", "q2", "q3", // Poetic line with indent levels
  "qr", // Right-aligned poetic line
  "qc", // Centered poetic line
  "qa", // Acrostic heading
  "qm", "qm1", "qm2", // Embedded text poetic line
  "qd", // Hebrew note
  "li", "li1", "li2", "li3", "li4", // List item (ordered or unordered)
  "lim", "lim1", "lim2", "lim3", // Embedded list item
  "lf", // List footer
  "lh", // List header
  "liv", "liv1", "liv2", "liv3", // Vernacular list item
  "lik", // List entry key
  "tr", // Table row
  "esb", // Sidebar
  "eb", // Extended book intro
  "div", // Division intro
  "sd", // Section intro
  "efm", // Extended footnote
  "ex", // Extended cross reference
  "cat", // Content category
]);

// Character markers (require closing marker with *)
export const characterMarkers = new Set([
  "v", // Verse Marker
  "bd", // Bold text
  "it", // Italic text
  "bdit", // Bold italic text
  "em", // Emphasized text
  "sc", // Small caps
  "w", // Word/phrase
  "wg", // Greek word/phrase
  "wh", // Hebrew word/phrase
  "wa", // Aramaic word/phrase
  "nd", // Name of deity
  "tl", // Transliterated word
  "pn", // Proper name
  "addpn", // Proper name (added)
  "qt", // Quoted text
  "sig", // Signature
  "ord", // Ordinal number
  "add", // Added text
  "lit", // Liturgical note
  "sls", // Secondary language source
  "dc", // Deuterocanonical/LXX additions
  "bk", // Quoted book title
  "k", // Keyword/keyterm
  "wj", // Words of Jesus
  "ior", // Introduction outline reference range
  "iqt", // Introduction quoted text
  "rq", // Inline quotation reference
  "qs", // Selah expression
  "qac", // Acrostic letter
  "lik", // List entry key
  "liv", "liv1", "liv2", "liv3", // List entry values
  "th1", "th2", "th3", "th4", // Table header cells
  "thr1", "thr2", "thr3", "thr4", // Table header cells (right aligned)
  "tc1", "tc2", "tc3", "tc4", // Table cells
  "tcr1", "tcr2", "tcr3", "tcr4", // Table cells (right aligned)
  "jmp", // Link text
  "cat", // Content category (when used inline)
]);

// Note markers (require closing marker with * and may have caller)
export const noteMarkers = new Set([
  "f", // Footnote
  "fe", // Endnote
  "x", // Cross reference
]);

// Note content markers (no closing marker needed)
export const noteContentMarkers = new Set([
  "fr", // Footnote reference
  "ft", // Footnote text
  "fk", // Footnote keyword
  "fl", // Footnote label
  "fw", // Footnote witness
  "fp", // Footnote paragraph
  "fq", // Footnote quotation
  "fqa", // Footnote alternate translation
  "xo", // Cross reference origin reference
  "xk", // Cross reference keyword
  "xq", // Cross reference quotation
  "xt", // Cross reference target references
  "xta", // Cross reference target alternate
  "xop", // Cross reference published origin text
  "xot", // Cross reference published target text
  "xnt", // Cross reference published target notes
  "xdc", // Cross reference published target dictionary
]);

// Milestone markers
export const milestoneMarkers = new Set([
  "qt", // Quotation milestone
  "ts", // Translator's section milestone
]);

// Peripheral book identifiers
export const peripheralBooks = new Set([
  "FRT", // Front matter
  "INT", // Introductions
  "BAK", // Back matter
  "CNC", // Concordance
  "GLO", // Glossary
  "TDX", // Topical index
  "NDX", // Names index
  "OTH", // Other
]);

// Standard peripheral division identifiers
export const peripheralDivisionIds = new Set([
  "title",
  "halftitle",
  "promo",
  "imprimatur",
  "pubdata",
  "foreword",
  "preface",
  "contents",
  "alphacontents",
  "abbreviations",
  "intletters",
  "cover",
  "spine",
  "intbible",
  "intot",
  "intpent",
  "inthistory",
  "intpoetry",
  "intprophesy",
  "intdc",
  "intnt",
  "intgospels",
  "intepistles",
  "chron",
  "measures",
  "maps",
  "lxxquotes",
]);

/**
 * Maps markers to their default attribute names according to USFM spec
 * For example: \w gracious|grace\w* -> the default attribute "lemma" gets value "grace"
 */
export const markerDefaultAttributes: Record<string, string> = {
  w: "lemma",
  // Add more markers with their default attributes here as needed
}; 