# Lisan al-Dawat Lexicon & Spell Bank — Business Logic & Technical Specification

## 1. Product Vision & Linguistic Context

### 1.1 Objective
Build a lightweight, elegant, and distraction-free reference dictionary and active spell bank for **Lisan al-Dawat** (لسان الدعوة), the literary, religious, and vernacular language of the Dawoodi Bohra community. 

Unlike conventional language apps that treat vocabulary in isolation, this system anchors every term to two tiers of contextual usage:
1. **Sentence-level reference** (`مثال في الجملة`): Demonstrates grammatical inflection, particles, and verb concord in everyday Bohra Gujarati usage.
2. **Passage/Paragraph-level reference** (`سياق العبارة`): Demonstrates how the term appears in continuous classical *bayaan*, sermons, correspondence, or traditional narrative prose.

### 1.2 Linguistic Characteristics of Lisan al-Dawat
* **Substrate**: Western Indo-Aryan (predominantly Gujarati morphology and syntax).
* **Superstrate**: Extensive Arabic (theological, philosophical, jurisprudential), Persian (administrative, poetic, cultural), and Urdu vocabulary.
* **Orthography**: Arabic script, predominantly using the Naskh or Nastaliq calligraphic traditions, adapted with modified letters for Gujarati retroflex sounds (such as ڻ, ڑ, ݣ / گ, ڄ / ڇ, ٽ, ڊ) and standard Arabic orthography for imported loanwords (retaining etymological Arabic spellings like ط, ظ, ص, ض, ث, ذ, ع, ح).
* **Orthographic Pitfalls**: Native speakers frequently misspell words by substituting phonetically equivalent letters (e.g., swapping س with ص, or ت with ط, or using Urdu/Persian spelling conventions where classical Arabic root spellings are required).

---

## 2. Design System & UI/UX Manifesto

### 2.1 The "Anti-AI" Editorial Aesthetic
Modern AI-generated software interfaces frequently suffer from recognizable clichés: high-contrast dark modes, electric cyan/purple gradients, glassy semi-transparent cards (`backdrop-filter`), floating neon glows, and generic robotic illustrations.

This application intentionally rejects those patterns in favor of a **curated, classical print editorial aesthetic** reminiscent of high-end typographers, literary journals, and scholarly manuscript archives:
* **Color Palette**:
  * Surface Paper: `#FBF9F5` (warm eggshell parchment)
  * Card Surface: `#FFFFFF` (crisp matte finish)
  * Ink Primary: `#23211F` (deep sumi/carbon charcoal, softer than pure black)
  * Ink Secondary: `#656059` (muted sepia-gray)
  * Ink Muted: `#8E877E` (warm gray for metadata and captions)
  * Accent Crimson: `#842816` (traditional oxblood/madder ink used in classical marginalia and rubrication)
  * Accent Soft: `#F8EBE8` (pale tinted wash for badges and active states)
  * Borders: `#E6DFD3` (delicate 1px hairline border)
* **Typography Pairing**:
  * **Arabic / Lisan al-Dawat Script**: `Amiri`, `Traditional Arabic`, `Scheherazade New`, or `Noto Naskh Arabic`. Rendered with generous line-height (`1.8`–`2.2`) and an explicit font-size bump (+25% over Latin text) to accommodate diacritics (*tashkeel*).
  * **English / Headings**: Editorial serif typography (`Newsreader`, `Charter`, `Georgia`, or `Baskerville`).
  * **UI Elements / Badges**: Clean humanist or neutral sans-serif (`Inter`, system UI sans).
* **Layout Principles**:
  * Minimalist single-column and split-column hierarchy.
  * No animated confetti, bouncy micro-interactions, or extraneous iconography.
  * Generous white space and strict WCAG AAA contrast for reading comfort.

---

## 3. Data Schema & Core Domain Models

### 3.1 Lexicon Entry (`LexiconEntry`)
Every word in the dictionary is represented by a strictly typed structure:

```typescript
interface LexiconEntry {
  // Unique immutable identifier (slugified transliteration)
  id: string;

  // Primary orthography in Arabic script with optional diacritics
  arabic: string;

  // Normalized Arabic script without tashkeel (used for search indexing)
  arabicNormalized: string;

  // Scholarly phonetic transliteration (ISO or traditional Bohra convention)
  transliteration: string;

  // Phonetic transcription in Gujarati script (e.g., 'બરકત')
  gujaratiPhonetic: string;

  // Etymological root and language origin (Arabic, Persian, Gujarati, Urdu)
  origin: string;
  rootLetters?: string; // e.g., "ب-ر-ك"

  // Grammatical Part of Speech ('Noun', 'Verb', 'Adjective', 'Particle', 'Compound')
  partOfSpeech: string;

  // Concise English / Primary definition
  definition: string;

  // Editorial notes regarding usage, register, or community custom
  notes: string;

  // Orthographic notes highlighting common spelling mistakes
  spellingGuide?: {
    commonMisspellings: string[];
    rule: string;
  };

  // Tier 1 Context: Standalone sentence
  sentenceReference: {
    arabic: string;
    translation: string;
    gloss?: string;
  };

  // Tier 2 Context: Continuous paragraph / bayaan passage
  paragraphReference: {
    arabic: string;
    translation: string;
    contextType: 'Bayaan' | 'Kalam' | 'Correspondence' | 'Narrative';
  };

  // System metadata
  isCustom?: boolean; // True if created by the user
  createdAt?: string; // ISO 8601 timestamp
  updatedAt?: string;
}
```

### 3.2 Spell Bank Bookmark (`SpellBankRecord`)
Users can save words to their personal review list:

```typescript
interface SpellBankRecord {
  entryId: string;
  savedAt: string; // ISO 8601 timestamp
  masteryLevel: 'learning' | 'reviewing' | 'mastered';
  notes?: string;
}
```

---

## 4. Core Business Logic & State Machines

### 4.1 Search & Fuzzy Matching Engine
The search bar must handle queries submitted in Arabic, Roman transliteration, Gujarati script, or English definitions.

#### Normalization Rules
1. **Arabic Normalization**:
   * Strip all diacritics: Fatha (`َ`), Damma (`ُ`), Kasra (`ِ`), Sukun (`ْ`), Shadda (`ّ`), Tanwin (`ً`, `ٍ`, `ٌ`).
   * Normalize Alif variants: `أ`, `إ`, `آ`, `ٱ` $\rightarrow$ `ا`.
   * Normalize Tā Marbūṭah: `ة` $\leftrightarrow$ `ه` / `ت`.
   * Normalize Yā variants: `ى`, `ي` $\rightarrow$ `ي`.
   * Normalize Kaf/Gaf: `ك`, `ک`, `گ`, `ݣ`.
2. **Roman Transliteration Normalization**:
   * Lowercase query.
   * Strip diacritical macrons (e.g., `ā`, `ī`, `ū`, `ṭ`, `ṣ`, `ḥ` $\rightarrow$ `a`, `i`, `u`, `t`, `s`, `h`).
   * Phonetic aliases (e.g., `kh` $\approx$ `x`, `gh` $\approx$ `g`, `ee` $\approx$ `i`, `oo` $\approx$ `u`).

#### Matching Priority (Ranked Order)
1. Exact match on normalized Arabic script.
2. Exact match on transliteration.
3. Substring match on Gujarati script.
4. Substring match on English definition and grammatical root.
5. In-context match within sentence or paragraph references.

---

### 4.2 Spell Bank & Review System
The spell bank operates as a lightweight personal orthography coach.

1. **State Machine**:
   * `NOT_SAVED` $\xrightarrow{\text{User clicks "Add to Spell Bank"}}$ `SAVED (Learning)`.
   * `SAVED` $\xrightarrow{\text{User toggles "Mark as Mastered"}}$ `MASTERED`.
   * `SAVED` $\xrightarrow{\text{User clicks "Remove"}}` `NOT_SAVED`.
2. **Storage Persistence**:
   * Client-first: Store `SpellBankRecord[]` in `localStorage` under `lisan_spellbank_v1` or `IndexedDB`.
   * Export/Import: Allow exporting the user's spell bank as a portable `.json` file for backups or cross-device syncing.

---

### 4.3 Custom Word Creation & Validation Engine
Users can contribute new words to their local dictionary:

1. **Validation Constraints**:
   * `arabic`: Must contain at least one valid Arabic/Perso-Arabic Unicode code point (`\u0600-\u06FF`, `\u0750-\u077F`, `\u08A0-\u08FF`). Required.
   * `transliteration`: Alphanumeric Latin string. Required.
   * `definition`: Non-empty string. Required.
   * `sentenceReference.arabic`: Required to enforce the pedagogical requirement of contextual learning.
   * `paragraphReference.arabic`: Required to ensure continuous textual grounding.
2. **Deduplication**:
   * System checks if normalized Arabic or transliteration already exists.
   * If an existing entry matches, the system prompts the user to add the new sentence/paragraph as an alternate reference rather than duplicating the headword.

---

## 5. UI Architecture & View Hierarchy

### 5.1 Component Structure
* **AppHeader**:
  * Dual-language title: *Lisan al-Dawat Lexicon* / *لسان الدعوة الغراء*.
  * Minimalist action bar: "Add Word", "Export Data", "Import Data".
* **FilterBar**:
  * Unified search box with clear button and keyboard shortcut (`/` to focus).
  * Tab toggle: `All Words (N)` | `My Spell Bank (N)`.
  * Optional root/origin filter pills: `All`, `Arabic Roots`, `Persian/Urdu`, `Gujarati/Bohra Idioms`.
* **WordCardList**:
  * Virtualized or paginated stack of editorial word cards.
  * Empty states with contextual guidance.
* **WordCard**:
  * Top bar: Arabic Headword (RTL, 36px font, with tashkeel) + Transliteration & Part of Speech.
  * Meaning block: Primary definition + etymological root + cultural/vernacular notes.
  * Sentence Reference Card: Callout block featuring Arabic sentence, highlighted target word, and idiomatic translation.
  * Paragraph Reference Card: Multi-line passage showing register, syntax, and discourse markers.
  * Bottom action strip: "Add to Spell Bank" toggle + "Copy Arabic" button.
* **AddWordModal / Drawer**:
  * Minimalist slide-over drawer for entering new entries with live preview.

---

## 6. Offline-First Technical Architecture

* **Client Engine**: Single-page application runnable entirely from local disk without mandatory internet access or active server backends.
* **Data Layer**:
  * Standard seed database bundled in `lexicon.json`.
  * User delta storage in browser `localStorage` (`lisan_custom_lexicon`).
  * Seamless merge logic: `activeLexicon = [...seedLexicon, ...customLexicon]`.
* **Typography Fallbacks**:
  * System-first font stack ensures instant offline rendering even before web fonts finish loading:
    `"Traditional Arabic", "Amiri", "Scheherazade New", "Geeza Pro", "Sakkal Majalla", serif`.

---

## 7. Antigravity Prompting Roadmap

When implementing or extending this application using Antigravity or AI coding agents, execute the work across these four sequential prompts:

1. **Prompt 1 (Foundation & Design System)**:
   > "Implement the minimalist editorial UI according to Section 2 of `BUSINESS_LOGIC.md`. Set up the CSS variables for the warm paper palette, load the Amiri and Newsreader fonts with system fallbacks, and build the static layout with header, search bar, and filter tabs."

2. **Prompt 2 (Lexicon Engine & Dual-Reference Cards)**:
   > "Implement the `LexiconEntry` schema and rendering logic from Section 3 and 5. Render cards with large Arabic Naskh script, English transliteration, sentence-level callouts, and passage-level callouts. Highlight the target word in crimson within the passages."

3. **Prompt 3 (Search, Normalization & Spell Bank)**:
   > "Implement the multi-script search engine from Section 4.1 with Arabic diacritic stripping and transliteration matching. Connect the 'Add to Spell Bank' toggle with `localStorage` persistence and tab filtering."

4. **Prompt 4 (CRUD Modal & Portable JSON Sync)**:
   > "Add the 'Add New Entry' drawer with validation rules from Section 4.3. Implement JSON export and import functions so users can back up their custom words and spell bank."
