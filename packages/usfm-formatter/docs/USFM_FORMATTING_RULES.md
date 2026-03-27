# USFM Formatting Rules - Parsing and Building Semantics

This document defines the **whitespace and line structure semantics** for USFM (Unified Standard Format Markers) from two critical perspectives:

## Two Perspectives of USFM Processing

### 1. **Parser Perspective**: Understanding Semantic vs. Structural Whitespace
Parsers must distinguish between:
- **Semantic whitespace**: Whitespace that becomes part of the rendered content (affects HTML output, text display, etc.)
- **Structural whitespace**: Whitespace that is part of the USFM formatting syntax but doesn't affect rendered content

### 2. **Builder Perspective**: Constructing Valid USFM Syntax
Builders (formatters/generators) must know:
- **Mandatory whitespace**: Where whitespace is required for valid USFM syntax
- **Optional whitespace**: Where whitespace can be added for readability without altering semantic content
- **Forbidden whitespace**: Where adding whitespace would change the semantic meaning

**Purpose**: Enable tools to correctly parse USFM content and build formatted USFM output while preserving semantic integrity.

## Core Principles

### For Parsers:
1. **Semantic Whitespace Recognition**: Distinguish between content whitespace and structural formatting
2. **Content Preservation**: Extract actual text content while ignoring structural spacing
3. **Context-Aware Parsing**: Understand when whitespace is significant based on marker context

### For Builders:
1. **Syntax Compliance**: Generate syntactically valid USFM with required whitespace
2. **Semantic Preservation**: Never add whitespace that would alter rendered content
3. **Formatting Flexibility**: Add optional whitespace for readability where safe

### Universal Principles:
1. **Marker Integrity**: All USFM markers must maintain their structural format
2. **Line Continuation**: Trailing and leading whitespace around newlines indicates content continuation
3. **Same-Line Content Constraint**: Certain markers must have their content on the same line

---

## Parser vs Builder Perspectives: Whitespace Interpretation

### Parser Perspective: What Becomes Content

When parsing USFM, parsers must identify which whitespace becomes part of the rendered content:

#### ✅ Semantic Whitespace (Becomes Content):
```usfm
\p Paul was a servant  of God    # Multiple spaces between "servant" and "of" are content
\p Text \w word\w*  continues    # Spaces after closing \w* are content
\p Line with trailing spaces   
Next line                        # Trailing spaces indicate line continuation
```

**Parser extracts**: `"Paul was a servant  of God"`, `"Text word  continues"`, `"Line with trailing spaces Next line"`

#### ✅ Structural Whitespace (Formatting Only):
```usfm
\p    Paul was a servant         # Leading spaces after \p are structural
\p
Paul was a servant               # Newline after \p is structural

\w word\w*
\w another\w*                    # Newlines between character markers are structural
```

**Parser extracts**: `"Paul was a servant"`, `"Paul was a servant"`, `"word another"` (with space added)

### Builder Perspective: Where Whitespace Can Be Added

Builders can add whitespace in specific locations without altering content:

#### ✅ Safe Whitespace Addition (No Content Change):
```usfm
# Input AST content: "Paul was a servant of God"

# Builder can generate any of these (same content):
\p Paul was a servant of God                    # Compact
\p    Paul was a servant of God                 # Extra spaces after marker (structural)
\p
Paul was a servant of God                       # Paragraph marker on separate line
\p Paul was a servant
of God                                          # Line continuation (no leading spaces)
```

#### ❌ Forbidden Whitespace Addition (Changes Content):
```usfm
# Input AST content: "Paul was a servant of God"

# Builder MUST NOT generate these (content changes):
\p Paul was a  servant of God                  # Extra space changes content
\p Paul was a servant  of God                  # Extra spaces change content
\p Paul was a servant of God                   # Trailing spaces change content (unless continuation)
\p Paul was a servant
   of God                                      # Leading spaces after newline become content!
\p Paul was a servant
    of God                                     # Leading spaces become part of rendered text!
```

---

## 1. Paragraph Type Markers

### Parser Perspective: Whitespace Interpretation

**Paragraph type markers** (e.g., `\p`, `\q`, `\m`, etc.) have specific whitespace semantics:

- **Structural whitespace**: Space/newline immediately after marker is formatting only
- **Semantic whitespace**: Additional whitespace after the first space becomes content
- **Content extraction**: Parsers should extract text content while ignoring structural spacing

### Builder Perspective: Whitespace Generation

- **Mandatory whitespace**: At least one whitespace (space or newline) must separate marker from content
- **Optional formatting**: Builders can add indentation, line breaks for readability
- **Semantic preservation**: Any additional whitespace in source content must be maintained

#### Parser Examples:

```usfm
# Source USFM:
\p This is paragraph content           # Parser extracts: "This is paragraph content"
\p  This has intentional extra space   # Parser extracts: " This has intentional extra space" (extra space is content)
\q1   Poetry line with leading spaces  # Parser extracts: "  Poetry line with leading spaces" (leading spaces are content)
\p
This content follows on next line     # Parser extracts: "This content follows on next line"
```

#### Builder Examples:

```usfm
# Input AST content: "This is paragraph content"

# Builder can generate any of these (same semantic content):
\p This is paragraph content           # Compact format
\p    This is paragraph content        # Extra spaces after marker (structural whitespace)
\p
This is paragraph content             # Marker on separate line

# But if AST content is " This has extra space", builder MUST generate:
\p  This has extra space              # Preserve the semantic leading space

# If AST content is "  Poetry with leading spaces", builder MUST generate:
\q1   Poetry with leading spaces      # Preserve the semantic leading spaces
```

#### ❌ Invalid Builder Output:
```usfm
# If AST content is "This is content", builder MUST NOT generate:
\p  This is content                   # INVALID: Adds semantic whitespace not in AST
\p This is  content                   # INVALID: Adds semantic whitespace within content
```

---

## 2. Character and Other Marker Types

### Rule: Newline or Single Whitespace Prepending

**Character markers** (e.g., `\w`, `\bd`, `\it`, `\v`) and other non-paragraph markers can be prepended with:

- **Single newline** (`\n`) when starting a new line
- **Single whitespace** (` `) when continuing on the same line

#### ✅ Correct Examples:
```usfm
\p Paul was \w a servant\w* of God.
\p Text
\v 1 Verse content
\p \v 1 Verse immediately after paragraph
```

#### ❌ Incorrect Examples:
```usfm
\p Paul was  \w servant\w* text    # WRONG: Double space before character marker
\p Text\n\n\v 1 Verse             # WRONG: Double newline before verse
```

---

## 3. Content Whitespace Preservation

### Rule: Significant Whitespace Preservation

**Multiple types of whitespace are semantically significant** and must be preserved exactly as authored:

1. **Whitespace before markers**: All whitespace before the start of a marker (except newlines) is significant
2. **Whitespace after closing markers**: All whitespace immediately following closing markers is significant
3. **Trailing whitespace before line breaks**: Whitespace at the end of a line before a newline indicates **line continuation** - the content continues as part of the same logical unit

#### ✅ Correct Examples:
```usfm
\p Text   with   multiple   spaces before \w marker\w* continues
\p Content    \bd bold\bd* text

# Whitespace after closing markers is significant:
\p Paul was \w a servant\w*  of God and apostle.    # Two spaces after \w* 
\p Text \bd bold\bd*   continues here.              # Three spaces after \bd*
\p Content \f + \fr 1:1 \ft Note.\f*    more text.  # Multiple spaces after \f*
\p Word \w strong|lemma="test"\w*     text.          # Multiple spaces after attributed marker

# Line continuation with trailing whitespace:
\p This is a very long paragraph that needs to be split   
across multiple lines for readability but remains one logical unit.

\v 1 This verse content is getting quite long so we split it   
across lines while preserving the semantic unity of the verse.

\s1 A Very Long Section Heading That Exceeds Line Length   
So We Continue It Here
```

#### ❌ Incorrect Examples:
```usfm
\p Text with multiple spaces before \w marker\w* continues    # WRONG: Normalized internal spaces
\p Content \bd bold\bd* text                                 # WRONG: Reduced spaces before marker

# WRONG: Normalizing whitespace after closing markers
\p Paul was \w a servant\w* of God and apostle.              # WRONG: Reduced from two spaces to one
\p Text \bd bold\bd* continues here.                         # WRONG: Reduced from three spaces to one
\p Content \f + \fr 1:1 \ft Note.\f* more text.             # WRONG: Removed significant spacing

# WRONG: Removing trailing whitespace breaks line continuation
\p This is a very long paragraph that needs to be split
across multiple lines for readability but remains one logical unit.
# ^ This creates two separate text nodes instead of one continuous text

# WRONG: Not preserving the line continuation whitespace
\v 1 This verse content is getting quite long so we split it
across lines while preserving the semantic unity of the verse.
# ^ This breaks the verse into separate parts
```

---

## 4. Same-Line Content Constraint

### Rule: Content Must Be on Same Line as Marker

Certain markers **must have their content immediately following on the same line** - they cannot have content that starts on a new line.

**Same-line content markers include:**
- **Chapter markers**: `\c`
- **Verse markers**: `\v`
- **Metadata markers**: `\id`, `\h`, `\toc1`, `\toc2`, `\toc3`, `\ide`, `sts`, `rem`
- **Heading/Title markers**: `\mt1`, `\mt2`, `\mt3`, `\ms1`, `\ms2`, `\s1`, `\s2`, `\s3`, `\r`

### Whitespace Rules for Same-Line Content Markers:

1. **Minimum requirement**: At least one whitespace must separate marker from content
2. **Formatter constraint**: Formatters should only add exactly one space when generating output
3. **Preservation rule**: Any additional whitespace after the first space is **semantically significant** and must be preserved

#### ✅ Valid Examples:
```usfm
\c 1                          # Standard: single space
\c  1                         # Valid: extra space is significant content
\c   1                        # Valid: multiple spaces are significant
\v 1 Verse content            # Standard: single space  
\v 1  Verse with extra space  # Valid: extra spaces in content are significant
\id TIT Titus                 # Standard formatting
\id TIT  Titus                # Valid: extra space is significant
\s1 Heading                   # Standard formatting
\s1  Heading with indent      # Valid: extra space creates indentation
```

#### ❌ Invalid Examples for Same-Line Content:
```usfm
\c1                      # INVALID: No space between marker and content
\v1 Content              # INVALID: No space between marker and content

\c 1
Some content             # INVALID: Content on new line

\s1 Heading
More heading content     # INVALID: Content continues on new line
```



#### 🔧 Formatter Guidelines:
```usfm
# When generating output, formatters should produce:
\c 1                     # Single space only
\v 1 Content             # Single space only

# But when processing existing content, preserve:
\c  1                    # Keep the extra space (it's significant)
\v 1   Content with spaces  # Keep all spaces after first one

# Formatters can provide flexibility while preserving semantics:
\s1 Very Long Heading That Could Be
    Split For Readability        # Allow line continuation if whitespace indicates it

\v 1 Long verse content that
     continues on next line      # Allow verse content across lines with proper continuation
```

---

## 5. Builder Flexibility Guidelines

### Rule: Structural Formatting Without Semantic Changes

Builders (formatters/generators) can provide flexible presentation options while preserving semantic content. The key is understanding where **structural whitespace** can be added without creating **semantic whitespace**.

#### Flexible Formatting Options:

1. **Character marker line breaks**: Allow character markers to be placed on new lines for readability
```usfm
# Conservative output:
\p Paul was \w a servant|strong="G1401"\w* of God

# Flexible formatting option:
\p
Paul was 
\w a servant|strong="G1401"\w* 
of God
```

2. **Long content splitting**: Allow long text content to be split across lines using line continuation
```usfm
# Conservative output:
\s1 The Very Long Section Heading That Might Be Hard To Read

# Flexible formatting option:
\s1 The Very Long Section Heading 
That Might Be Hard To Read          # Line continuation (no leading spaces)
```

3. **Verse content formatting**: Allow verse content to be formatted across lines
```usfm
# Conservative output:
\v 1 This is a very long verse with lots of content and character markers \w word|strong="G123"\w* more content

# Flexible formatting option:
\v 1 This is a very long verse with lots of content 
and character markers \w word|strong="G123"\w* 
more content                        # Line continuation preserves verse unity
```

4. **Character marker word separation**: When character markers are on separate lines with no whitespace between them, formatters may add whitespace since they represent different words
```usfm
# Input with character markers on separate lines:
\w Παῦλος|lemma="Παῦλος" strong="G39720"\w*,
\w δοῦλος|lemma="δοῦλος" strong="G14010"\w*
\w Θεοῦ|lemma="θεός" strong="G23160"\w*

# Formatter may safely add spaces (they're different words):
\w Παῦλος|lemma="Παῦλος" strong="G39720"\w*, \w δοῦλος|lemma="δοῦλος" strong="G14010"\w* \w Θεοῦ|lemma="θεός" strong="G23160"\w*

# Or keep them separated across lines:
\w Παῦλος|lemma="Παῦλος" strong="G39720"\w*,
\w δοῦλος|lemma="δοῦλος" strong="G14010"\w*
\w Θεοῦ|lemma="θεός" strong="G23160"\w*
```

#### Constraints for Builder Flexibility:

1. **Preserve semantic whitespace**: Any whitespace that is part of the AST content must be maintained exactly
2. **Add only structural whitespace**: Only add whitespace that parsers will ignore (not extract as content)
3. **Follow line continuation rules**: Use proper leading/trailing whitespace to indicate continuation
4. **Respect same-line content constraints**: Markers requiring same-line content must have at least some content on the same line
5. **Word boundary safety**: When character markers are on separate lines with no whitespace, builders may add whitespace since they represent different words
6. **Maintain semantic consistency**: Built output must parse back to equivalent content structure

---

## 6. Line Continuation Rules

### Rule: Cross-Line Content Relationship

**Content can be split across multiple lines** while maintaining semantic unity. This relationship is indicated by whitespace patterns, but even without explicit whitespace indicators, adjacent content across line breaks can be semantically related.

#### Key Principles:
1. **Trailing whitespace preservation**: Spaces before newlines must be preserved exactly as authored
2. **Leading whitespace preservation**: Spaces after newlines must be preserved exactly as authored  
3. **Semantic continuity**: Content on continuation lines belongs to the same node/marker
4. **Sibling relationship**: The last node of a line and first node of the next line are considered siblings
5. **Text joining capability**: Adjacent text nodes across lines can be joined by formatters when appropriate
6. **Formatter constraint**: When generating output, formatters should not add unnecessary line breaks
7. **Parser behavior**: Parsers must recognize continuation patterns and unite the content appropriately

### ⚠️  Critical Warning: No Structural Indentation in USFM

**USFM has no concept of structural indentation or formatting whitespace.** All whitespace is either:
1. **Structural** (immediately after markers) - ignored by parsers
2. **Semantic** (part of content) - becomes rendered text

**Any whitespace at the beginning of a line after a line break becomes part of the semantic content** and will be rendered in the final output.

```usfm
# This USFM:
\p Paul was a servant
    of God

# Renders as: "Paul was a servant    of God" (with 4 spaces before "of")
# NOT as: "Paul was a servant of God"

# For indentation/formatting, USFM uses markers, not whitespace:
\q1 First level poetry    # \q1 marker indicates indentation level
\q2 Second level poetry   # \q2 marker indicates deeper indentation
\li1 First level list     # \li1 marker indicates list indentation
```

**Builders should never add leading whitespace for "formatting" - use appropriate USFM markers instead.**

#### ✅ Valid Line Continuation Examples:
```usfm
# 1. Explicit trailing whitespace continuation:
\p This is a very long paragraph that would exceed reasonable line length   
so we continue it here on the next line.

# 2. Leading whitespace after newline (BECOMES CONTENT):
\p This paragraph continues
    with leading spaces on the next line.
# ⚠️  WARNING: The 4 spaces before "with" become part of the rendered text!

# 3. Both trailing and leading whitespace (LEADING BECOMES CONTENT):
\p Content with trailing spaces   
    and leading spaces on continuation.
# ⚠️  WARNING: The 4 spaces before "and" become part of the rendered text!

# 4. No explicit whitespace but semantic continuity:
\p This content continues
across lines without explicit whitespace indicators.

# 5. Text node joining scenarios:
\p First part of text
second part can be joined by formatters.

# 6. Verse content with various patterns:
\v 1 This verse has content   
that continues here.

\v 2 Another verse
    with leading spaces in continuation.

\v 3 Verse without explicit whitespace
but still semantically continuous.

# 7. Character marker spanning lines:
\p Paul was \w a servant   
of God\w* and apostle.

\p Text with \bd bold content
continuing here\bd* more text.

# 8. Note content continuation:
\p Text \f + \fr 1:1 \ft This is a very long footnote that   
needs to be split across lines for readability.\f* continues.

\p Another \f + \fr 1:2 \ft Note
    with leading spaces in note content\f* text.
```

#### ❌ Invalid Examples:
```usfm
# WRONG: Normalizing significant trailing whitespace
\p Content with trailing spaces
continuation here.    # Lost the original trailing spaces

# WRONG: Normalizing significant leading whitespace  
\p Content continues
with leading spaces.   # Lost the original leading spaces

# WRONG: Breaking inline-only marker content inappropriately
\v 1 Verse   
content split    # This violates inline-only rule for verses

# WRONG: Formatter unnecessarily breaking short content
\p Short text   
break.          # Unnecessary line break for short content

# WRONG: Not recognizing semantic continuity
\p First text
\p Second text  # Treating as separate paragraphs when they could be continuous
```

#### 🔧 Formatter Guidelines:
```usfm
# When processing existing content - PRESERVE ALL PATTERNS:
\p Content with trailing   
spaces here               # PRESERVE: Keep trailing whitespace exactly

\p Content continues
    with leading spaces   # PRESERVE: Keep leading whitespace exactly

\p Content without explicit
whitespace indicators     # PRESERVE: Recognize as continuous content

# When generating new output - BE CONSERVATIVE:
\p Long content continues here    # GENERATE: Keep on same line when possible

# When line length requires breaking - ADD EXPLICIT INDICATORS:
\p Very long content that exceeds maximum line length   
should be continued here with trailing whitespace

# Text node joining decisions:
\p First text
second text               # CAN JOIN: Adjacent text nodes can be united
                         # RESULT: "First text second text"

\p Text \w word
continues\w* more        # CAN JOIN: Within same logical structure
                         # RESULT: "Text \w word continues\w* more"
```

---

## 7. Line Structure Rules

### Rule: Marker Line Positioning

Certain markers have strict requirements about their line positioning:

#### Document Structure Markers
- `\id` - Must be the first marker, no preceding whitespace
- `\h` - Must start on a new line
- `\toc1`, `\toc2`, `\toc3` - Must start on new lines
- `\mt1`, `\mt2` - Must start on new lines

#### Chapter and Section Markers
- `\c` - Must start on a new line (except at document start)
- `\s1`, `\s2`, etc. - Must start on new lines
- `\r` - Must start on a new line

#### Paragraph Markers
- `\p`, `\m`, `\q1`, etc. - Must start on new lines (except at document start)

#### ✅ Correct Examples:
```usfm
\id TIT
\h Titus
\toc1 The Letter to Titus
\c 1
\s1 Paul's Greeting
\p
\v 1 Paul, a servant of God...
```

#### ❌ Incorrect Examples:
```usfm
\id TIT\h Titus                    # WRONG: Header on same line as ID
\c 1\s1 Paul's Greeting           # WRONG: Section on same line as chapter
\p\s1 Greeting                    # WRONG: Section marker after paragraph
```

---

## 8. Nested Marker Rules

### Rule: Nested Character Marker Formatting

**Nested character markers** use the `+` prefix and follow the same whitespace rules as their parent markers. **All whitespace after closing markers** (both nested and parent) **is significant**.

#### ✅ Correct Examples:
```usfm
\w outer \+nd inner\+nd* content\w*
\bd bold \+it italic\+it* text\bd*

# Whitespace after nested closing markers is significant:
\w outer \+nd inner\+nd*  content\w*      # Two spaces after nested closing
\bd bold \+it italic\+it*   text\bd*      # Three spaces after nested closing
\w word \+nd nested\+nd*    \+it more\+it*  end\w*  # Multiple nested with spacing
```

#### ❌ Incorrect Examples:
```usfm
\w outer\+nd inner\+nd*content\w*         # WRONG: Missing spaces around nested marker
\w outer  \+nd inner\+nd*  content\w*     # WRONG: Extra spaces around nested marker

# WRONG: Normalizing whitespace after nested closing markers
\w outer \+nd inner\+nd* content\w*       # WRONG: Reduced significant spacing after \+nd*
\bd bold \+it italic\+it* text\bd*        # WRONG: Reduced significant spacing after \+it*
```

---

## 9. Note Marker Rules

### Rule: Note Marker Spacing

**Note markers** (`\f`, `\fe`, `\x`) follow specific spacing patterns:

- Must have single space before opening when inline
- Caller character immediately follows marker
- Single space after caller before content
- No extra spacing around closing marker

#### ✅ Correct Examples:
```usfm
\p Paul \f + \fr 1:1 \ft This is a footnote.\f* wrote this letter.
\p Text \x - \xo 1:1 \xt Cross reference.\x* continues.
```

#### ❌ Incorrect Examples:
```usfm
\p Paul\f + \fr 1:1 \ft Footnote.\f*wrote letter.      # WRONG: No space before/after note
\p Text \f  + \fr 1:1 \ft Footnote.\f* continues.      # WRONG: Extra space after marker
```

---

## 10. Attribute Formatting Rules

### Rule: Attribute Spacing

**Marker attributes** must follow strict spacing rules:

- Pipe character (`|`) immediately follows marker content
- No spaces around the pipe character
- Attributes follow `key="value"` format
- Multiple attributes separated by single space

#### ✅ Correct Examples:
```usfm
\w word|strong="G123"
\w phrase|strong="G456" lemma="λόγος"
\zaln-s |who="Paul" x-occurrence="1"
```

#### ❌ Incorrect Examples:
```usfm
\w word | strong="G123"              # WRONG: Spaces around pipe
\w word|strong = "G123"              # WRONG: Spaces around equals
\w word|strong="G123"  lemma="test"  # WRONG: Multiple spaces between attributes
```

---

## 11. Milestone Marker Rules

### Rule: Milestone Marker Formatting

**Milestone markers** (e.g., `\zaln-s`, `\zaln-e`) have specific formatting requirements:

- Self-closing milestones end with `\*`
- Paired milestones have opening (`-s`) and closing (`-e`) variants
- Attributes follow immediately after marker with pipe separator

#### ✅ Correct Examples:
```usfm
\p \zaln-s |who="Paul"\*Content\zaln-e\*
\p Text \ts\* milestone \ts\* content
```

#### ❌ Incorrect Examples:
```usfm
\p \zaln-s |who="Paul" \* Content \zaln-e \*    # WRONG: Spaces before closing
\p Text \ts \* milestone \ts \* content          # WRONG: Spaces before closing
```

---

## 12. Validation Rules

### Parser Validation

Parsers must validate:

1. **Syntax compliance**: Proper marker structure and required whitespace
2. **Content extraction accuracy**: Correctly distinguish semantic vs structural whitespace
3. **Context-aware parsing**: Understand marker-specific whitespace rules

### Builder Validation

Builders must validate:

1. **Semantic preservation**: Output content matches input AST exactly
2. **Syntax generation**: Generated USFM follows proper marker and whitespace rules
3. **Structural whitespace safety**: Added whitespace doesn't become semantic content

### Universal Validation

Any USFM processing tool **MUST** validate and enforce these rules:

1. **Formatter output constraints**: 
   - Generate single space or newline after paragraph markers
   - Generate exactly one space between marker and content for inline-only markers
2. **Whitespace preservation**: 
   - Preserve all whitespace after the first space/newline (it's semantically significant)
   - Preserve all significant whitespace before markers
   - **Preserve all whitespace after closing markers** (it's semantically significant)
   - **Preserve trailing whitespace before line breaks** (indicates line continuation)
3. **Line continuation handling**:
   - Recognize trailing whitespace + newline as explicit continuation pattern
   - Recognize leading whitespace after newline as explicit continuation pattern
   - Treat adjacent content across lines as potentially related (siblings)
   - Allow text node joining across lines when semantically appropriate
   - Unite continued content into single logical units when indicated
   - Respect continuation for readability while maintaining semantic unity
4. **Same-line content constraints**: 
   - Content must be on same line as marker for same-line content markers
   - Line continuation rules still apply for whitespace preservation
5. **Line positioning**: Ensure markers appear on correct lines according to structure rules
6. **Nested marker formatting**: Proper `+` prefix usage and spacing
7. **Attribute formatting**: Correct pipe and attribute spacing
8. **Note marker spacing**: Proper spacing around note markers and callers

### Error Handling

When encountering malformed USFM that violates these rules, formatters should:

1. **Log warnings** for rule violations
2. **Attempt correction** where unambiguous
3. **Preserve original** when correction would be destructive
4. **Report errors** for critical structural violations

---

## Implementation Guidelines

### For Formatter Developers

1. **Never override** these rules with custom formatting preferences
2. **Always validate** input before applying custom rules
3. **Preserve semantic whitespace** even when normalizing
4. **Test extensively** with edge cases and malformed input
5. **Document deviations** if any exceptions are absolutely necessary

### For Content Authors

1. **Follow these rules** when manually editing USFM
2. **Use validators** to check compliance before publishing
3. **Understand significance** of whitespace in USFM structure
4. **Test formatting** with multiple tools to ensure compatibility

---

## Reference Implementation

This document serves as the authoritative reference for USFM formatting rules. Any formatter implementation should be tested against these rules to ensure compliance and interoperability.

**Version**: 1.0  
**Last Updated**: 2024  
**Compatibility**: USFM 3.1 Specification 