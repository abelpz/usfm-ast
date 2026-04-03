# Oracle diff: `examples/usfm-markers/cv-vp/vp-example-1/example.usfm`

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
--- examples/usfm-markers/cv-vp/vp-example-1/example.usfm (original)
+++ examples/usfm-markers/cv-vp/vp-example-1/example.usfm (roundtripped)
@@ -1 +1 @@
+ \ms1 Addition B
+ \cp B
+ \s1 A Copy of the Letter
+ \p
+ \v 14 This is a copy of the letter:
+ \pmo From Artaxerxes, the Great King, to the governors and officials of my one hundred twenty-seven provinces from India to Ethiopia.
+ \pm
+ \v 15 I rule many nations, and I am the most powerful king in the world. But I have never used my power in a proud or arrogant way. Instead, I have always been reasonable and kind to the people in my kingdom. I know they want peace, and so I have decided to make every part of my kingdom peaceful and safe for travel.
- \ms1 Addition B
- \cp B
- \s1 A Copy of the Letter 
- \p
- \v 14 \vp 1b\vp* This is a copy of the letter:
- \pmo From Artaxerxes, the Great King, to the governors and officials of my one 
- hundred twenty-seven provinces from India to Ethiopia.
- \pm
- \v 15 \vp 2b\vp* I rule many nations, and I am the most powerful king in the 
- world. But I have never used my power in a proud or arrogant way. Instead, I have 
- always been reasonable and kind to the people in my kingdom. I know they want peace, 
- and so I have decided to make every part of my kingdom peaceful and safe for travel.
```
