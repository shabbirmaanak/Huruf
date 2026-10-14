# Qamoos53 (لسان الدعوة) Full Dataset

Complete dictionary dataset and assets extracted from **Qamoos53** (`com.qamoos53`), the official Lisan al-Dawat reference dictionary application developed by **Dawat-e-Hadiyah (Attalim North America)**.

---

## ✦ Application Metadata

- **Application Name:** Qamoos53
- **Package ID:** `com.qamoos53`
- **Developer:** Dawat-e-Hadiyah (America) - Attalim North America
- **Extracted Version:** 2.3
- **Source Backend:** `https://dawatehadiyahattalimna.org`
- **Platform:** Google Play Store / Android APK

---

## ✦ Dataset Overview & Statistics

| Metric | Count | Details |
| :--- | :--- | :--- |
| **Total Words** | **8,587** | Hand-curated Lisan-ud-dawat vocabulary entries |
| **Active Entries** | **8,578** | Active headwords in current lexicon |
| **Words with Audio Pronunciations** | **6,864** | Direct MP3 URLs hosted on Dawat-e-Hadiyah CDN |
| **Words with Thematic Illustrations** | **816** | High-res PNG/JPG illustration URLs |
| **Words with Example Sentences** | **996** | Contextual sentence usage examples |
| **Thematic Categories** | **20** | Sheher, Bagicha, Madressa, Phal, Sabzi, Haiwanat, etc. |
| **Meanings (Lisan-ud-Dawat)** | **18,239** | Classical definitions and vernacular explanations |
| **Translations** | **17,738** | English (`en`), French (`fr`), and Arabic (`ab`) translations |
| **Embedded Fonts** | **31** | Authentic typography: Al-Kanz, Kanz-al-Marjaan, Dubai, Uthman Taha |

---

## ✦ File Manifest

All files are located in `data/qamoos53/`:

### 1. Primary Datasets
- **`qamoos_words.json`** (12 MB): Complete array of 8,587 word objects with fully populated Lisan meanings, English and French translations, thematic categories, grammatical forms, audio URLs, and illustration URLs.
- **`qamoos53.sqlite`** (5.7 MB): Production-grade SQLite relational database with indexed tables (`words`, `meanings`, `translations`, `categories`, `word_meanings`, `word_translations`, `word_categories`) and a pre-joined `v_dictionary` view.
- **`qamoos_words.csv`** (2.0 MB): Tabular spreadsheet format for rapid exploration in Excel, Google Sheets, or pandas.
- **`qamoos_thematic.json`** (432 KB): Grouped dictionary arranged across all 20 thematic categories with pictures and audio.
- **`qamoos_categories.json`** (113 KB): Listing of all 20 categories, word counts, and associated headwords.
- **`qamoos_summary.json`**: Machine-readable metadata and distribution statistics.

### 2. Original App Artifacts
- **`qamoos.realm`** (5.0 MB): The raw embedded Realm Core database extracted directly from the APK assets.
- **`fonts/`**: 31 authentic font files used by the application, including:
  - `Al-Kanz for Windows.ttf`, `Al-Kanzfonts.ttf`, `al_kanz.ttf`
  - `Kanz-al-Marjaan.ttf`, `kanz_al_marjaan.ttf`
  - `dubai_bold.TTF`, `dubai_mediam.TTF`, `dubai_light.TTF`
  - `KFGQPC Uthman Taha Naskh Regular.ttf`
  - `Poppins-*` and `Arial-*` font families
- **`raw/`**: Individual normalized JSON dumps of the Realm tables (`meanings.json`, `translations.json`, `categories.json`).

---

## ✦ Word Entry Schema

Each object in `qamoos_words.json` has the following structure:

```json
{
  "id": 3,
  "word_name": "اْئيس كريم",
  "transliteration": "Ice cream",
  "level": "beginner",
  "english_meaning": "Ice cream",
  "french_meaning": "La crème glacée",
  "meanings_lisan": [
    "ايك قسم ني منجمد ميتهاس ؛ جه عموماً دودهـ يا كريم سي بنسس ؛ انسس مختلف ذائقةؤ سي اهنسس ذائقة دار كرواما اْوسس ؛"
  ],
  "sentence": "",
  "singular": "",
  "plural": "",
  "alphabet": "ا",
  "word_terms": "ائيس كريم",
  "sequence": "ايس كريم",
  "is_active": true,
  "image_url": "https://dawatehadiyahattalimna.org/public/storage/9459/ice_cream_2727806_640.png",
  "image_name": "ice_cream_2727806_640.png",
  "audio_url": "https://dawatehadiyahattalimna.org/public/storage/3800/277.mp3",
  "audio_name": "277.mp3",
  "categories": [],
  "meanings": [
    {
      "id": 3,
      "meaning": "ايك قسم ني منجمد ميتهاس..."
    }
  ],
  "translations": [
    {
      "id": 8,
      "locale": "en",
      "word_name": "Ice cream",
      "transliteration": "",
      "sentence": "",
      "singular": "",
      "plural": "",
      "alphabet": "",
      "word_terms": "",
      "meanings": []
    },
    {
      "id": 9,
      "locale": "fr",
      "word_name": "La crème glacée",
      "transliteration": "",
      "sentence": "",
      "singular": "",
      "plural": "",
      "alphabet": "",
      "word_terms": "",
      "meanings": []
    }
  ]
}
```

---

## ✦ Thematic Categories (20 Topics)

1. **Sheher** (City & Geography)
2. **bagicha** (Garden & Nature)
3. **madressa** (School & Learning)
4. **phal** (Fruits)
5. **shugal** (Professions & Hobbies)
6. **hawas_khamsa** (The Five Senses)
7. **adad** (Numbers)
8. **Ashara** (Ashara Mubaraka Religious Vocabulary)
9. **sabzi** (Vegetables)
10. **adwat** (Tools & Instruments)
11. **aazaa** (Body Parts)
12. **haiwanat** (Animals)
13. **jazbaat** (Emotions & Feelings)
14. **aasmaan** (Celestial & Sky)
15. **manazir** (Landscapes & Scenery)
16. **rasoru** (Kitchen & Culinary)
17. **safar** (Travel & Journey)
18. **mausam** (Weather & Seasons)
19. **ashkal** (Shapes & Forms)
20. **rang** (Colors)

---

## ✦ Example Usage

### Python (JSON)
```python
import json

with open('data/qamoos53/qamoos_words.json', 'r', encoding='utf-8') as f:
    words = json.load(f)

# Find words by Arabic or transliteration
query = "بركت"
matches = [w for w in words if query in w['word_name'] or query in w['word_terms']]
for m in matches:
    print(m['word_name'], "->", m['english_meaning'], "(Audio:", m['audio_url'], ")")
```

### Python (SQLite)
```python
import sqlite3

conn = sqlite3.connect('data/qamoos53/qamoos53.sqlite')
cur = conn.cursor()

# Search across English or Lisan words
cur.execute('''
    SELECT lisan_word, transliteration, english_meaning, audio_url 
    FROM v_dictionary 
    WHERE english_meaning LIKE ? OR lisan_word LIKE ?
    LIMIT 5
''', ('%blessing%', '%بركت%'))

for row in cur.fetchall():
    print(row)
```

### JavaScript / Node.js
```javascript
const fs = require('fs');
const words = JSON.parse(fs.readFileSync('data/qamoos53/qamoos_words.json', 'utf-8'));

console.log(`Loaded ${words.length} words from Qamoos53!`);
```
