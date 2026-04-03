# Oracle diff: `examples/usfm-markers/char-th/th-example-1/example.usfm`

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
--- examples/usfm-markers/char-th/th-example-1/example.usfm (original)
+++ examples/usfm-markers/char-th/th-example-1/example.usfm (roundtripped)
@@ -1 +1 @@
+ \id NUM
+ \c 7
+ \p
+ \v 12-83 They presented their offerings in the following order:
+ \tr \th1 Day \th2 Tribe \th3 Leader
+ \tr \tcr1 1st \tc2 Judah \tc3 Nahshon son of Amminadab
+ \tr \tcr1 2nd \tc2 Issachar \tc3 Nethanel son of Zuar
+ \tr \tcr1 3rd \tc2 Zebulun \tc3 Eliab son of Helon
+ \tr \tcr1 4th \tc2 \w Reuben|lemma="Rubén"\w* \tc3 Elizur son of Shedeur
- \id NUM
- \c 7
- \p
- \v 12-83 They presented their offerings in the following order:
- \tr \th1 Day \th2 Tribe \th3 Leader
- \tr \tcr1 1st \tc2 Judah \tc3 Nahshon son of Amminadab
- \tr \tcr1 2nd \tc2 Issachar \tc3 Nethanel son of Zuar
- \tr \tcr1 3rd \tc2 Zebulun \tc3 Eliab son of Helon
- \tr \tcr1 4th \tc2 \w Reuben|Rubén\w* \tc3 Elizur son of Shedeur
  \tr \tcr1 5th \tc2 Simeon (\ref 1.5|NUM 1:5\ref*) \tc3 Shelumiel son of Zurishaddai
```
