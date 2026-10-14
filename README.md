# Lisan al-Dawat Lexicon & Spell Bank (لسان الدعوة الغراء)

An elegant, distraction-free reference lexicon and active orthography coach for **Lisan al-Dawat** (لسان الدعوة), the literary, religious, and vernacular language of the Dawoodi Bohra community.

---

## ✦ Key Features

### 1. Dual-Tier Contextual Grounding
Unlike conventional dictionaries that display isolated vocabulary, this application grounds every term in two contextual tiers:
* **Tier 1: Sentence-Level Reference (`مثال في الجملة`)**: Illustrates everyday syntax, particle agreement, and Gujarati-Arabic hybrid morphology.
* **Tier 2: Textual Passage Reference (`سياق العبارة`)**: Continuous classical *bayaan*, sermons, correspondence, or traditional narrative prose demonstrating higher register, discourse markers, and religious eloquence.
* **Editorial Crimson Rubrication**: The target headword is automatically highlighted in classical oxblood red (`#842816`) within all Arabic textual passages.

### 2. "Anti-AI" Editorial Design System
Rejects artificial neon dark-modes, gradient cards, and glassy blur effects in favor of a **curated, classical print editorial aesthetic**:
* **Surface Paper**: `#FBF9F5` (warm eggshell parchment)
* **Ink Primary**: `#23211F` (deep sumi/carbon charcoal)
* **Accent Crimson**: `#842816` (traditional oxblood/madder ink)
* **Typography**: Pairing classical Arabic Naskh (`Amiri`, `Scheherazade New`) with editorial serif typography (`Newsreader`) and humanist sans-serif UI accents (`Inter`).

### 3. Multi-Script Search & Orthographic Normalization
* **Arabic Diacritic Stripping**: Ignores *tashkeel* (fatha, damma, kasra, sukun, shadda, tanwin) and unifies Alif variants (`أ, إ, آ, ٱ` $\rightarrow$ `ا`), Ta Marbutah, and Ya variants.
* **Roman Transliteration**: Strips macrons and underdots (`ā, ī, ū, ṭ, ṣ, ḥ, ḍ, ẓ`), handles phonetic aliases (`kh` $\approx$ `x`, `ee` $\approx$ `i`, `oo` $\approx$ `u`).
* **Gujarati Script Matching**: Direct phonetic search (e.g. `બરકત`, `ઇખલાસ`, `તફદ્દુલ`).
* **Ranked Priority Engine**: Exact Arabic $\rightarrow$ Exact Transliteration $\rightarrow$ Gujarati $\rightarrow$ English Definitions $\rightarrow$ Grammatical Roots $\rightarrow$ In-Context Occurrences.

### 4. Personal Spell Bank & Mastery Tracking
* **3-Stage Mastery Pipeline**: Words saved to your Spell Bank transition smoothly between:
  $$\text{Learning (جاري الحفظ)} \longrightarrow \text{Reviewing (مراجعة)} \longrightarrow \text{Mastered (متقن)}$$
* **Orthographic Pitfall Warnings**: Highlighting common phonetic spelling mistakes (e.g. confusing ص with س, or omitting Arabic root consonants) with canonical orthographic rules.

### 5. Custom Word Contribution & Deduplication
* Dedicated slide-over drawer to add new terms with live validation.
* Built-in deduplication engine that alerts you if a term already exists in the lexicon.

### 6. Zero-Dependency, Offline-First Architecture
* Works straight out of the box by opening `index.html` in any web browser without server setup.
* Complete persistence via `localStorage`.
* One-click JSON backup export and import for seamless cross-device syncing.

---

## ✦ Getting Started

### Option 1: Direct File Open
Double-click `index.html` in Finder or open it in your browser:
```bash
open index.html
```

### Option 2: Local HTTP Server (Optional)
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

---

## ✦ Project Structure

```
├── index.html                      # Semantic single-page application shell
├── css/
│   └── styles.css                  # Classical print editorial design system
├── js/
│   ├── app.bundle.js               # Universal standalone offline bundle
│   ├── app.js                      # Main application controller
│   ├── normalize.js                # Multi-script search & fuzzy ranking engine
│   └── storage.js                  # LocalStorage state machine & sync engine
├── data/
│   ├── lexicon.json                # Scholarly seed dictionary dataset (JSON)
│   └── seed.js                     # Seed lexicon ES module
├── build.py                        # Standalone bundle generator
├── lisan_al_dawat_business_logic.md# Original specification document
└── README.md                       # Documentation & guide
```

---

## ✦ Keyboard Shortcuts

* `/` : Instantly focus the search bar from anywhere on the page
* `Escape` : Clear search input or dismiss slide-over drawer
* `Enter` (inside search) : View top ranked result
