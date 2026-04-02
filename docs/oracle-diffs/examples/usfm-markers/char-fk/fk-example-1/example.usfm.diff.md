# Oracle diff: `examples/usfm-markers/char-fk/fk-example-1/example.usfm`

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

## USFM diff (1 hunk)

```diff
--- examples/usfm-markers/char-fk/fk-example-1/example.usfm (original)
+++ examples/usfm-markers/char-fk/fk-example-1/example.usfm (roundtripped)
@@ -1 +1 @@
+ \p
+ \v 20 Adam\f + \fr 3.20: \fk Adam: \ft This name in Hebrew means “all human beings.”\f* named his wife Eve,\f + \fr 3.20: \fk Eve: \ft This name sounds similar to the Hebrew word for “living,” which is rendered in this context as “human beings.”\f* because she was the mother of all human beings. 
+ \v 21 And the \nd Lord\nd* God made clothes out of animal skins for Adam and his wife, and he clothed them.
- \p
- \v 20 Adam\f + \fr 3.20: \fk Adam: \ft This name in Hebrew means “all human 
- beings.”\f* named his wife Eve,\f + \fr 3.20: \fk Eve: \ft This name sounds 
- similar to the Hebrew word for “living,” which is rendered in this context 
- as “human beings.”\f* because she was the mother of all human beings.
- \v 21 And the \nd Lord\nd* God made clothes out of animal skins for Adam and 
- his wife, and he clothed them.
```
