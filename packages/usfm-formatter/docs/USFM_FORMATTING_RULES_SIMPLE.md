# USFM Formatting Rules - Essential Guide

## Core Principle

**USFM has only two types of whitespace:**
1. **Structural whitespace** (first space immediately after markers, all newlines) - ignored by parsers
2. **Semantic whitespace** (all other spaces) - becomes rendered content

**Note: Newlines are ALWAYS structural - USFM uses `//` for optional line breaks in content**

## Basic Rules

### 1. Marker Separation

A marker and its content must be separated by either a single space or a single newline.
Exceptions: Some markers only allow a single space, and some markers only allow a single newline as structural content separation.

```usfm
\p content                # ✅ Space separates marker from content
\p
content                   # ✅ Newline separates marker from content
\pcontent                 # ❌ No separation - invalid (parser may understand this as a marker called "pcontent" that has no content)
```

### 2. Semantic Whitespace Preservation
```usfm
\p Text  with  spaces     # ✅ Multiple spaces are content
\p Text \w word\w*  more  # ✅ Spaces after \w* are content
\p Line one
Line two                  # ✅ Parser extracts: "Line one" + "Line two" (separate nodes)
                          # Builder may add space when joining adjacent text nodes
\p Line one
  Line two                # ✅ Newline ignored, leading spaces are content: "Line one  Line two"
```

### 3. Parser vs Builder Perspectives

**Parser**: Extract semantic content, ignore structural whitespace
```usfm
\p Text content           # Extracts: "Text content" 
\p  Text content          # Extracts: " Text content" (first space structural, second is content)
\p
Text content              # Extracts: "Text content" (newline is structural)
\p
  Text content            # Extracts: "  Text content" (newline structural, spaces are content)
```

**Builder**: Add only structural whitespace, preserve all semantic whitespace
```usfm
# If AST content is "Text content", can generate:
\p Text content           # ✅ Space is structural
\p
Text content              # ✅ Newline is structural

# If AST content is " Text content" (with leading space), must generate:
\p  Text content          # ✅ First space structural, second preserves content
\p
 Text content             # ✅ Newline structural, leading space preserves content

# If AST content is "   Text content" (with 3 leading spaces), must generate:
\p    Text content        # ✅ First space structural, next 3 preserve content
\p
   Text content           # ✅ Newline structural, 3 leading spaces preserve content
```

### 4. Same-Line Content Markers

**These markers MUST have their content on the same line (no newline allowed between marker and content):**

- **Chapter/Verse**: `\c`, `\v`, `\va`, `\vp`
- **Identification**: `\id`, `\usfm`, `\ide`, `\sts`, `\rem`, `\h`, `\toc1`, `\toc2`, `\toc3`, `\toca1`, `\toca2`, `\toca3`
- **Headings/Titles**: `\mt1`, `\mt2`, `\mt3`, `\mt4`, `\mte1`, `\mte2`, `\ms1`, `\ms2`, `\ms3`, `\mr`, `\s1`, `\s2`, `\s3`, `\s4`, `\s5`, `\sr`, `\r`, `\d`, `\sp`
- **Section markers**: `\is1`, `\is2`, `\ip`, `\ipi`, `\im`, `\imi`, `\ipq`, `\imq`, `\ipr`

```usfm
\c 1                      # ✅ Chapter content on same line
\v 1
\id TIT                   # ✅ ID content on same line
\mt1 The Book of Titus    # ✅ Title content on same line
\s1 Paul Greets Titus     # ✅ Section heading on same line

\c
1                         # ❌ Chapter content cannot start on new line
\v
1                         # ❌ Verse content cannot start on new line
\mt1
The Book of Titus         # ❌ Title content cannot start on new line
\s1
Paul Greets Titus         # ❌ Section heading cannot start on new line
```

### 5. Character Marker Word Boundaries
```usfm
\w word1\w*\w word2\w*    # Parser extracts: "word1" + "word2" (separate nodes)
\w word1\w*
\w word2\w*               # Parser extracts: "word1" + "word2" (separate nodes)
                          # Builder may add space when placing on same line
```

## Critical Warnings

### ⚠️ No Structural Indentation
```usfm
# WRONG - leading spaces become content:
\p Text
    more text             # Renders: "Text    more text" (newline ignored, spaces are content)

# RIGHT - use markers for structure:
\q1 First level poetry    # Use \q1 for indentation
\q2 Second level poetry   # Use \q2 for deeper indentation
\s1 Jesus Heals a Man // Who Could Not Walk  # Use // for optional line breaks
```

### ⚠️ All Whitespace After Closing Markers is Content
```usfm
\p Text \w word\w*  continues     # Two spaces after \w* are content
\p Text \bd bold\bd*   more       # Three spaces after \bd* are content
```

## Builder Safety Rules

1. **Preserve semantic whitespace exactly** - never normalize content spaces
2. **Add only structural whitespace** - only after markers, never within content
3. **Use markers for formatting** - never use whitespace for visual layout of code, only for content
4. **Same-line content requirement** - chapter, verse, identification, heading, title, and section markers must have content on same line
5. **Word boundary decisions** - when placing adjacent word nodes on same line, builder may add spaces between them
6. **Validate roundtrip** - built USFM must parse to same content

## Examples

### ✅ Safe Builder Operations
```usfm
# Input AST: "Paul was a servant of God"
\p Paul was a servant of God      # Minimal format
\p Paul was a
servant of God                    #Code structural line break (does not affect content rendering)
\p
Paul was a servant of God         # Marker on separate line
```

### ❌ Forbidden Builder Operations  
```usfm
# Input AST: "Paul was a servant of God"
\p Paul was a  servant of God     # ❌ Added semantic space
\p Paul was a servant
    of God                        # ❌ Added semantic leading spaces
```

---

**Summary**: USFM whitespace is either structural (first spaceafter markers, ignored) or semantic (everywhere else, rendered). Builders can add structural whitespace for formatting but must never alter semantic whitespace. Use USFM markers, not whitespace, for visual formatting. 