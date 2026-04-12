# Alignment patterns

This guide explains **word-level alignment** between **Spanish** and **English**. Alignment means showing which word or group of words in Spanish corresponds to which word or group of words in English.

It starts with plain examples. After that, it shows how the same idea is represented in **align-link** and **USFM**.

## What alignment is

Example:

**English:** Peace comes from God.

**Spanish:** La paz viene de Dios.

In this sentence:

- **paz** aligns to **Peace**
- **Dios** aligns to **God**

So alignment is simply a way to mark those correspondences between the two languages.

In the examples below, **square brackets** show the aligned words or groups of words.

**English:** [Peace] comes from [God].

**Spanish:** La [paz] viene de [Dios].

## What the examples in this guide show

Each pattern may include up to three views of the same alignment:

1. a **plain example**,
2. an **align-link** line, and
3. a **USFM** example.

You can understand the alignment patterns from the plain examples alone. The align-link and USFM sections show how the same pattern is written in structured notation.

## Convention used in this guide

In this guide, the examples align **Spanish to English**:

- **English** is the source side
- **Spanish** is the aligned-text side

The notation itself is not limited to these two languages. The same notation can be used for any language pair.

So when you see an example, the question is: **which Spanish word or phrase is linked to which English word or phrase?**

---

## Align-link (compact notation)

Align-link is a compact way to write the alignment in one line. It is **not USFM**.

Example:

```text
Él[He|1] vio a su[his|1] hermano y a su[his|2] hermana
```

This means:

- **Él** aligns to **He|1**
- the first **su** aligns to the first **his|1**
- the second **su** aligns to the second **his|2**
- `|1` and `|2` show **which occurrence** of that source-side word is meant in the current scope

### Basic forms

In align-link, the source side is always written in brackets. On the aligned-text side, use brackets only for multi-word spans. Inside the source bracket, separate source words with spaces.

**Legend**

- `aligned` = one word on the aligned-text side
- `source` = one word on the source side
- `occ` = occurrence number

**Forms with examples**

- `aligned[source|occ]` → `paz[Peace|1]`
- `aligned[source|occ source|occ]` → `Jesucristo[Jesus|1 Christ|1]`
- `[aligned aligned][source|occ]` → `[Todo el mundo][Everyone|1]`
- `[aligned aligned][source|occ source|occ]` → `[en general][by|1 and|1 large|1]`
- plain text = unaligned material

### Reference `@...`

You can add `@C:V` when the source is outside the current verse or scope.

Example:

```text
esperanza[hope|1@3:15]
```

If `@...` is absent, assume the link stays within the current verse or current division.

---

## USFM alignment basics

USFM shows the same alignment information in a more structural way than align-link. Because it uses more markers and attributes, it helps to read it in small steps.

### 1. The `\\w` marker

```usfm
\\w paz|x-occurrence="1"\\*
```

This marks a word in the aligned text.

Here:

- `\\w` starts the word markup,
- `paz` is the word itself,
- `x-occurrence="1"` means this is the first instance of that word in the current scope,
- `\\w*` ends the word markup.

### 2. The `\\zaln` markers

```usfm
\\zaln-s |x-content="Peace" x-occurrence="1"\\*
...
\\zaln-e\\*
```

These markers show an alignment to the source side.

Here:

- `\\zaln-s` starts the alignment,
- `x-content="Peace"` gives the source-side word,
- `x-occurrence="1"` means the first instance of that source-side word in the current scope,
- `\\zaln-e\\*` ends the alignment.

If the source word is outside the current verse or division, USFM may also include an `x-reference` attribute. That plays the same role as `@C:V` in align-link.

### 3. `\\w` and `\\zaln` together

```usfm
\\zaln-s |x-content="Peace" x-occurrence="1"\\*
\\w paz|x-occurrence="1"\\w*
\\zaln-e\\*
```

This means that `paz` is aligned to `Peace`.

In this example:

- `\\zaln-s` starts an alignment to the source-side word `Peace`,
- `\\w paz ... \\w*` marks the aligned-text word inside that alignment,
- `\\zaln-e\\*` closes that alignment.

To keep the examples short, the USFM snippets below show only the attributes needed to understand the alignment structure.

| Marker             | What it does                     |
| ------------------ | -------------------------------- |
| `\\w ... \\w*`     | marks a word in the aligned text |
| `\\zaln-s ... \\*` | starts an alignment              |
| `\\zaln-e\\*`      | ends an alignment                |

| Marker     | Attributes shown in the examples |
| ---------- | -------------------------------- |
| `\\zaln-s` | `x-content`, `x-occurrence`      |
| `\\w`      | `x-occurrence`                   |

`x-occurrence` tells you **which instance** of a word is meant in the current scope.

If a word appears more than once, then:

- `1` means first instance
- `2` means second instance
- and so on

This is counted separately for each word. If _Jesus_ appears once and _Christ_ appears once, both can have occurrence `1`.

### 4. Stacked `\zaln` markers (N source words)

When several source-side words align to one or more Spanish words, you open one `\zaln-s` per source word, write the Spanish `\w` words inside, and then close all of them in order.

```usfm
\zaln-s |x-content="Jesus" x-occurrence="1"\*
\zaln-s |x-content="Christ" x-occurrence="1"\*
\w Jesucristo|x-occurrence="1"\w*
\zaln-e\*
\zaln-e\*
```

The `\zaln-s` markers stack like open parentheses; the matching `\zaln-e\*` markers close them from the inside out. The Spanish `\w` words sit in the middle. How many `\w` are inside determines the cardinality:

| Source `\zaln-s` count | Spanish `\w` count | Cardinality |
| ---------------------- | ------------------- | ----------- |
| N                      | 1                   | N∶1         |
| N                      | M                   | N∶M         |
| 1                      | N                   | 1∶N         |

## Tokenization note (English)

Possessives such as _God’s_ may be tokenized as two words, `God` and `s`, with the apostrophe treated as punctuation between them. Unless your tokenizer merges the whole form, do not treat _God’s_ as a single English word in a 1\:N example.

---

## 1. One-to-one (1:1)

One English word aligns to one Spanish word.

**English:** [Peace] comes from [God].

**Spanish:** La [paz] viene de [Dios].

Each bracketed pair is its own group: `[Peace]` ↔ `[paz]`, `[God]` ↔ `[Dios]`.

**Align-link**

```text
La paz[Peace|1] viene de Dios[God|1]
```

**USFM**

```usfm
\w La|x-occurrence="1"\w*
\zaln-s |x-content="Peace" x-occurrence="1"\*
\w paz|x-occurrence="1"\w*
\zaln-e\*
\w viene|x-occurrence="1"\w*
\w de|x-occurrence="1"\w*
\zaln-s |x-content="God" x-occurrence="1"\*
\w Dios|x-occurrence="1"\w*
\zaln-e\*
```

---

## 2. One-to-many (1\:N)

One English word aligns to several Spanish words.

**English:** [Everyone] came early.

**Spanish:** [Todo] [el] [mundo] vino temprano.

Here **Everyone** aligns to the three-word Spanish span **todo el mundo**.

**Align-link**

```text
[Todo el mundo][Everyone|1] vino temprano
```

**USFM**

```usfm
\zaln-s |x-content="Everyone" x-occurrence="1"\*
\w Todo|x-occurrence="1"\w*
\w el|x-occurrence="2"\w*
\w mundo|x-occurrence="3"\w*
\zaln-e\*
\w vino|x-occurrence="1"\w*
\w temprano|x-occurrence="1"\w*
```

---

## 3. Many-to-one (N:1)

Several English words align to one Spanish word.

**English:** [Jesus] [Christ] saves.

**Spanish:** [Jesucristo] salva.

This often happens when Spanish uses a compound or merged form.

**Align-link**

```text
Jesucristo[Jesus|1 Christ|1] salva
```

**USFM**

```usfm
\zaln-s |x-content="Jesus" x-occurrence="1"\*
\zaln-s |x-content="Christ" x-occurrence="1"\*
\w Jesucristo|x-occurrence="1"\w*
\zaln-e\*
\zaln-e\*
\w salva|x-occurrence="1"\w*
```

---

## 4. Many-to-many (N\:M)

Use N\:M when several English words align to several Spanish words and the phrase cannot be represented clearly as simple 1:1 or 1\:N links.

This is common with idioms.

**English:** [by] [and] [large]

**Spanish:** [en] [general]

The idiom **by and large** corresponds to **en general**. This is **3:2**, and forcing word-by-word links would be misleading.

**Align-link**

```text
[en general][by|1 and|1 large|1]
```

**USFM**

```usfm
\zaln-s |x-content="by" x-occurrence="1"\*
\zaln-s |x-content="and" x-occurrence="1"\*
\zaln-s |x-content="large" x-occurrence="1"\*
\w en|x-occurrence="1"\w*
\w general|x-occurrence="2"\w*
\zaln-e\*
\zaln-e\*
\zaln-e\*
```

---

## 5. Non-contiguous Spanish-side words

A Spanish-side alignment group is **non-contiguous** when one of its Spanish words is separated from another by a different aligned Spanish word.

Punctuation, spaces, and line breaks do not break contiguity. Only another aligned `\w` from a different group does.

### 5a. Non-contiguous 1\:N

**English:** The [Comforter] will help [you].

**Spanish:** El [que] [los] [consuela].

Here _Comforter_ is expressed as **que ... consuela**, while _you_ aligns to l**os**, which interrupts the first group.

**Align-link**

```text
El que[Comforter|1] los[you|1] consuela[Comforter|1]
```

**USFM**

```usfm
\w El|x-occurrence="1"\w*
\zaln-s |x-content="Comforter" x-occurrence="1"\*
\w que|x-occurrence="1"\w*
\zaln-s |x-content="you" x-occurrence="1"\*
\w los|x-occurrence="1"\w*
\zaln-e\*
\w consuela|x-occurrence="2"\w*
\zaln-e\*
```

### 5b. Non-contiguous N\:M

Sometimes the interrupted group is itself N\:M.

**English:** He [carried] [out] the [mission].

**Spanish:** Él [llevó] la [misión] [a] [cabo].

The idiom **carry out** corresponds to **llevar a cabo**, so the group is **2:3**. The object **la misión** interrupts the Spanish idiom.

**Align-link**

```text
Él llevó[carried|1 out|1] la[the|1] misión[mission|1] [a cabo][carried|1 out|1]
```

**USFM**

```usfm
\w Él|x-occurrence="1"\w*
\zaln-s |x-content="carried" x-occurrence="1"\*
\zaln-s |x-content="out" x-occurrence="1"\*
\w llevó|x-occurrence="1"\w*
\zaln-s |x-content="the" x-occurrence="1"\*
\w la|x-occurrence="1"\w*
\zaln-e\*
\zaln-s |x-content="mission" x-occurrence="1"\*
\w misión|x-occurrence="1"\w*
\zaln-e\*
\w a|x-occurrence="2"\w*
\w cabo|x-occurrence="3"\w*
\zaln-e\*
\zaln-e\*
```

---

## 6. Repeated surface words

When the same surface form appears more than once, `x-occurrence` distinguishes the instances.

**English:** [He] saw [his] brother and [his] sister.

**Spanish:** [Él] vio a [su] hermano y a [su] hermana.

**Align-link**

```text
Él[He|1] vio a su[his|1] hermano y a su[his|2] hermana
```

**USFM**

```usfm
\w y|x-occurrence="1"\w*
\w a|x-occurrence="1"\w*
\zaln-s |x-content="his" x-occurrence="2"\*
\w su|x-occurrence="2"\w*
\zaln-e\*
\w hermana|x-occurrence="1"\w*
```

---

## 7. Inverted clause order

When translation reverses the order of clauses, a Spanish token may align to a later English occurrence, and vice versa.

**English (source order):** the grace of¹ God and the peace of² Christ

**Spanish (inverted order):** la paz de¹ Cristo y la gracia de² Dios

The first Spanish `de` aligns to the **second** English `of`, because the clause order is reversed.

**Align-link**

```text
la[the|2] paz[peace|1] de[of|2] Cristo[Christ|1] y la[the|1] gracia[grace|1] de[of|1] Dios[God|1]
```

**USFM**

```usfm
\zaln-s |x-content="the" x-occurrence="2"\*
\w la|x-occurrence="1"\w*
\zaln-e\*
\zaln-s |x-content="peace" x-occurrence="1"\*
\w paz|x-occurrence="1"\w*
\zaln-e\*
\zaln-s |x-content="of" x-occurrence="2"\*
\w de|x-occurrence="1"\w*
\zaln-e\*
\zaln-s |x-content="Christ" x-occurrence="1"\*
\w Cristo|x-occurrence="1"\w*
\zaln-e\*
\w y|x-occurrence="1"\w*
\zaln-s |x-content="the" x-occurrence="1"\*
\w la|x-occurrence="2"\w*
\zaln-e\*
\zaln-s |x-content="grace" x-occurrence="1"\*
\w gracia|x-occurrence="1"\w*
\zaln-e\*
\zaln-s |x-content="of" x-occurrence="1"\*
\w de|x-occurrence="2"\w*
\zaln-e\*
\zaln-s |x-content="God" x-occurrence="1"\*
\w Dios|x-occurrence="1"\w*
\zaln-e\*
```

---

## Quick reference

| Pattern        | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| 1:1            | one source-side word aligns to one aligned-side word          |
| 1\:N           | one source-side word aligns to several aligned-side words     |
| N:1            | several source-side words align to one aligned-side word      |
| N\:M           | several source-side words align to several aligned-side words |
| Non-contiguous | one alignment group is interrupted by another                 |
| Inverted order | the two sides present the aligned material in different order |

---

## See also

- [`20-alignment-layer.md`](./20-alignment-layer.md) — USFM markers and editor-core mapping
- [`../packages/usfm-parser/tests/fixtures/usfm/tit.tpl-aligned-patterns.md`](../packages/usfm-parser/tests/fixtures/usfm/tit.tpl-aligned-patterns.md) — Greek ↔ Spanish Titus TPL line-level examples
