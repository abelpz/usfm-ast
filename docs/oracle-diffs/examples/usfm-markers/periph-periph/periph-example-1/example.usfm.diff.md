# Oracle diff: `examples/usfm-markers/periph-periph/periph-example-1/example.usfm`

## Scores

| Metric | Value |
|---|---|
| **USJ text similarity** | 99.7% |
| **USJ structure similarity** | 100.0% |
| **USJ combined score** | 99.8% |
| **USX structure similarity** | 100.0% |
| **USX attribute similarity** | 100.0% |
| **USX tag-histogram similarity** | 100.0% |
| **USX combined score** | 100.0% |
| **Overall** | ✅ PASS |

## USFM diff (1 hunk)

```diff
--- examples/usfm-markers/periph-periph/periph-example-1/example.usfm (original)
+++ examples/usfm-markers/periph-periph/periph-example-1/example.usfm (roundtripped)
@@ -1 +1 @@
+ \id FRT 
+ ... 
+ \periph Title Page|id="title"
+ \mt1 Holy Bible
+ \mt3 with
+ \mt2 Deuterocanonicals/Apocrypha ...
+ \periph Foreword|id="foreword"
+ \h Foreword
+ \mt1 Foreword
+ \p The \bk Good News Translation\bk* of the Bible is a translation which seeks to state clearly and accurately the meaning of the original texts in words and forms that are widely accepted by people who use English as a means of communication. ...
+ \periph Table of Contents|id="contents"
+ \h Table of Contents
+ \mt Contents
+ \s Old Testament
+ \tr \th1 Name \thr2 Page \th3 Name \thr4 Page
+ \tr \tc1 Genesis \tcr2 # \tc3 Ecclesiastes \tcr4 #...
- \id FRT
- ...
- \periph Title Page|id="title"
- \mt1 Holy Bible
- \mt3 with
- \mt2 Deuterocanonicals/Apocrypha
- ...
- \periph Foreword|id="foreword"
- \h Foreword
- \mt1 Foreword
- \p The \bk Good News Translation\bk* of the Bible is a translation which seeks to 
- state clearly and accurately the meaning of the original texts in words and forms 
- that are widely accepted by people who use English as a means of communication.
- ...
- \periph Table of Contents|id="contents"
- \h Table of Contents
- \mt Contents
- \s Old Testament
- \tr  \th1 Name  \thr2 Page \th3 Name \thr4 Page
- \tr \tc1 Genesis \tcr2 # \tc3 Ecclesiastes \tcr4 #
- ...
```
