# Oracle diff: `packages/usfm-parser/tests/fixtures/usfm/medium.usfm`

## Scores

| Metric | Value |
|---|---|
| **USJ text similarity** | 100.0% |
| **USJ structure similarity** | 100.0% |
| **USJ combined score** | 100.0% |
| **USX structure similarity** | 100.0% |
| **USX attribute similarity** | 100.0% |
| **USX tag-histogram similarity** | 100.0% |
| **USX combined score** | 100.0% |
| **Overall** | ✅ PASS |

## USFM diff (2 hunks)

```diff
--- packages/usfm-parser/tests/fixtures/usfm/medium.usfm (original)
+++ packages/usfm-parser/tests/fixtures/usfm/medium.usfm (roundtripped)
@@ -1 +1 @@
  \id TIT EN_ULT
- \usfm 3.1
  \h Titus
  \mt1 The Letter of Paul to
@@ -6 +6 @@
  \is Introduction
  \ip This is a letter from Paul to Titus.
- 
  \c 1
  \p
+ \v 1 Paul, a \bd servant\bd* of God and an \bd apostle\bd* of Jesus Christ, for the faith of God's chosen people and the knowledge of the truth. 
+ \v 2 These are in hope of eternal life that God, who does not lie, \add promised\add* before all the ages of time. 
- \v 1 Paul, a \bd servant\bd* of God and an \bd apostle\bd* of Jesus Christ, for the faith of God's chosen people and the knowledge of the truth.
- \v 2 These are in hope of eternal life that God, who does not lie, \add promised\add* before all the ages of time.
  \v 3 At the right time, he revealed his word by the message that he trusted me to deliver by the command of God our Savior.
- 
  \p
+ \v 4 To Titus, a true son in our common faith. \f + \fr 1:4 \fq true son \ft This is a metaphor that means Titus became a Christian through Paul's ministry.\f*Grace and peace from God \f + \fr 1:4 \fq God \ft Some versions add \fqa the Father\f* .\f* and Christ Jesus our Savior.
- \v 4 To Titus, a true son in our common faith. \f + \fr 1:4 \fq true son \ft This is a metaphor that means Titus became a Christian through Paul's ministry.\f*
- Grace and peace from God \f + \fr 1:4 \fq God \ft Some versions add \fqa the Father\fqa* .\f* and Christ Jesus our Savior.
- 
  \s5
  \p
+ \v 5 For this purpose I left you in Crete, that you might set in order things not yet complete and ordain elders in every city as I directed you. 
- \v 5 For this purpose I left you in Crete, that you might set in order things not yet complete and ordain elders in every city as I directed you.
  \v 6 An elder must be without blame, the husband of one wife, with faithful children not accused of reckless behavior or rebellion.
- 
```
