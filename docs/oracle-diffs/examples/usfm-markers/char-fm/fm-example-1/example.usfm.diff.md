# Oracle diff: `examples/usfm-markers/char-fm/fm-example-1/example.usfm`

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
--- examples/usfm-markers/char-fm/fm-example-1/example.usfm (original)
+++ examples/usfm-markers/char-fm/fm-example-1/example.usfm (roundtripped)
@@ -1 +1 @@
+ \v 9 \x - \xo 2.9: \xt Rev 2.7; 22.2,14.\x*He made all kinds of beautiful trees grow there and produce good fruit. In the middle of the garden stood the tree that gives life and the tree that gives knowledge of what is good and what is bad.\f + \fr 2.9: \fq knowledge of what is good and what is bad; \ft or \fq knowledge of everything.\f*...
+ \v 17 except the tree that gives knowledge of what is good and what is bad.\fm GEN 2:9You must not eat the fruit of that tree; if you do, you will die the same day.”
- \v 9 \x - \xo 2.9: \xt Rev 2.7; 22.2,14.\x* He made all kinds of beautiful 
- trees grow there and produce good fruit. In the middle of the garden stood 
- the tree that gives life and the tree that gives knowledge of what is good 
- and what is bad.\f + \fr 2.9: \fq knowledge of what is good and what is bad; 
- \ft or \fq knowledge of everything.\f*
- ...
- \v 17 except the tree that gives knowledge of what is good and what is 
- bad.\fm GEN 2:9\fm* You must not eat the fruit of that tree; if you do, you 
- will die the same day.”
```
