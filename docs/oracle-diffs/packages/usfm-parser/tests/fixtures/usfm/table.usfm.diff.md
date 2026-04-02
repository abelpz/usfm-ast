# Oracle diff: `packages/usfm-parser/tests/fixtures/usfm/table.usfm`

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
--- packages/usfm-parser/tests/fixtures/usfm/table.usfm (original)
+++ packages/usfm-parser/tests/fixtures/usfm/table.usfm (roundtripped)
@@ -1 +1 @@
+ \id NUM
+ \c 2
+ \p
+ \v 3-9 On the east side, those under the banner of the division of Judah shall camp in their groups, under their leaders, as follows:
+ \tr \th1 Tribe \th2 Leader \thr3 Number
+ \tr \tc1 Judah \tc2 Nahshon son of Amminadab \tcr3 74,600
+ \tr \tc1 Issachar \tc2 Nethanel son of Zuar \tcr3 54,400
+ \tr \tc1 Zebulun \tc2 Eliab son of Helon \tcr3 57,400
- \id NUM
- \c 2
- \p
- \v 3-9 On the east side, those under the banner of the division of Judah
- shall camp in their groups, under their leaders, as follows:
- \tr \th1 Tribe \th2 Leader \thr3 Number
- \tr \tc1 Judah \tc2 Nahshon son of Amminadab \tcr3 74,600
- \tr \tc1 Issachar \tc2 Nethanel son of Zuar \tcr3 54,400
- \tr \tc1 Zebulun \tc2 Eliab son of Helon \tcr3 57,400
  \tr \tcr1-2 Total: \tcr3 186,400
```
