/**
 * Lisan al-Dawat Lexicon & Spell Bank - Normalization & Matching Engine
 * Implements Section 4.1 of the Technical Specification.
 */

// Arabic Diacritics Regex (Tashkeel, Tanwin, Sukun, Shadda, Maddah, Dagger Alif, Tatweel)
const ARABIC_DIACRITICS_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;

/**
 * Normalizes Arabic text for indexation and fuzzy search:
 * - Strips all diacritics / tashkeel
 * - Normalizes Alif variants (أ, إ, آ, ٱ -> ا)
 * - Normalizes Ta Marbutah (ة -> ه)
 * - Normalizes Ya variants (ى -> ي)
 * - Normalizes Kaf / Gaf variants
 * - Normalizes Waw with Hamza (ؤ -> و)
 */
export function normalizeArabic(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(ARABIC_DIACRITICS_REGEX, '')
    // Alif variants
    .replace(/[أإآٱ]/g, 'ا')
    // Ta Marbutah
    .replace(/[ةۃ]/g, 'ه')
    // Ya variants
    .replace(/[ىيئ]/g, 'ي')
    // Kaf / Gaf variants
    .replace(/[كک]/g, 'ك')
    .replace(/[گݣ]/g, 'گ')
    // Waw with Hamza
    .replace(/ؤ/g, 'و')
    .trim();
}

/**
 * Normalizes Roman transliteration:
 * - Lowercases text
 * - Strips diacritical macrons and underdots (ā, ī, ū, ṭ, ṣ, ḥ, ḍ, ẓ -> a, i, u, t, s, h, d, z)
 * - Strips apostrophes and glottal stop symbols
 * - Handles phonetic aliases (kh ≈ x, ee ≈ i, oo ≈ u, gh ≈ g)
 */
export function normalizeTransliteration(text) {
  if (!text) return '';
  let str = text.toLowerCase().trim();

  // Strip macrons, underdots, circumflexes
  str = str
    .replace(/[āáàâ]/g, 'a')
    .replace(/[īíìî]/g, 'i')
    .replace(/[ūúùû]/g, 'u')
    .replace(/[ḍđ]/g, 'd')
    .replace(/[ṭŧ]/g, 't')
    .replace(/[ṣšŝ]/g, 's')
    .replace(/[ḥħ]/g, 'h')
    .replace(/[ẓžż]/g, 'z')
    .replace(/[ʻʼ'`’‘]/g, '');

  // Strip remaining combining diacritical marks
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return str;
}

/**
 * Creates a phonetic signature for Roman transliterations to catch phonetic variations.
 */
export function phoneticSignature(text) {
  let norm = normalizeTransliteration(text);
  return norm
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/th/g, 's') // Often pronounced 's' in Bohra Gujarati
    .replace(/ph/g, 'f')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/dh/g, 'z')
    .replace(/zh/g, 'z')
    .replace(/sh/g, 's')
    .replace(/q/g, 'k');
}

/**
 * Normalizes Gujarati script for clean substring search.
 */
export function normalizeGujarati(text) {
  if (!text) return '';
  return text.trim();
}

/**
 * Checks if a string contains Arabic script characters.
 */
export function isArabicScript(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

/**
 * Checks if a string contains Gujarati script characters.
 */
export function isGujaratiScript(text) {
  return /[\u0A80-\u0AFF]/.test(text);
}

/**
 * Calculates search match score and priority for a lexicon entry based on the query.
 * Returns a numerical score (> 0 if matched, 0 if no match).
 * 
 * Priority order as specified:
 * 1. Exact match on normalized Arabic script (100)
 * 2. Exact match on transliteration (90)
 * 3. Starts-with on normalized Arabic (85)
 * 4. Starts-with on transliteration (80)
 * 5. Substring match on Gujarati script (70)
 * 6. Substring match on English definition & root (60)
 * 7. In-context match within sentence or paragraph references (50)
 * 8. Phonetic signature match (40)
 */
export function scoreMatch(entry, query) {
  if (!query || !query.trim()) return 100; // All entries pass with neutral score

  const rawQuery = query.trim();
  const qArabic = normalizeArabic(rawQuery);
  const qTranslit = normalizeTransliteration(rawQuery);
  const qPhone = phoneticSignature(rawQuery);
  const qLower = rawQuery.toLowerCase();

  const entryArabicNorm = entry.arabicNormalized || normalizeArabic(entry.arabic);
  const entryTranslitNorm = normalizeTransliteration(entry.transliteration);
  const entryPhone = phoneticSignature(entry.transliteration);
  const entryGujarati = entry.gujaratiPhonetic || '';
  const entryDefinition = (entry.definition || '').toLowerCase();
  const entryOrigin = (entry.origin || '').toLowerCase();
  const entryRoot = (entry.rootLetters || '').toLowerCase();
  const entryRootNorm = normalizeArabic(entry.rootLetters || '');
  const entryNotes = (entry.notes || '').toLowerCase();

  // 1. Exact match on normalized Arabic script
  if (qArabic && entryArabicNorm === qArabic) {
    return 100;
  }

  // 2. Exact match on transliteration
  if (qTranslit && entryTranslitNorm === qTranslit) {
    return 95;
  }

  // 3. Starts-with match on Arabic script
  if (qArabic && entryArabicNorm.startsWith(qArabic)) {
    return 85;
  }

  // 4. Starts-with match on transliteration
  if (qTranslit && entryTranslitNorm.startsWith(qTranslit)) {
    return 80;
  }

  // 5. Substring match on Gujarati script
  if (isGujaratiScript(rawQuery) && entryGujarati.includes(rawQuery)) {
    return 75;
  }
  if (entryGujarati && rawQuery && entryGujarati.includes(rawQuery)) {
    return 70;
  }

  // 6. Substring match on English definition and grammatical root
  if (entryRootNorm && qArabic && entryRootNorm.includes(qArabic)) {
    return 65;
  }
  if (entryDefinition.includes(qLower) || entryOrigin.includes(qLower) || entryNotes.includes(qLower)) {
    return 60;
  }

  // 7. Substring match on Arabic within entry text
  if (qArabic && entryArabicNorm.includes(qArabic)) {
    return 55;
  }

  // 8. In-context match within sentence or paragraph references
  const sentenceAr = normalizeArabic(entry.sentenceReference?.arabic || '');
  const sentenceTr = (entry.sentenceReference?.translation || '').toLowerCase();
  const paraAr = normalizeArabic(entry.paragraphReference?.arabic || '');
  const paraTr = (entry.paragraphReference?.translation || '').toLowerCase();

  if (
    (qArabic && (sentenceAr.includes(qArabic) || paraAr.includes(qArabic))) ||
    sentenceTr.includes(qLower) ||
    paraTr.includes(qLower)
  ) {
    return 50;
  }

  // 9. Phonetic alias match (e.g., "barkat" matches "barakat", "misak" matches "misaaq")
  if (qPhone && entryPhone && (entryPhone === qPhone || entryPhone.includes(qPhone) || qPhone.includes(entryPhone))) {
    return 45;
  }

  // 10. Check common misspellings defined in the spelling guide
  if (entry.spellingGuide?.commonMisspellings) {
    for (const misspelling of entry.spellingGuide.commonMisspellings) {
      if (
        normalizeArabic(misspelling) === qArabic ||
        normalizeTransliteration(misspelling) === qTranslit
      ) {
        return 40;
      }
    }
  }

  return 0; // No match
}

/**
 * Highlights a target Arabic word within a text passage using an editorial crimson rubric mark.
 * Handles variations in diacritics and prefixes (e.g. و, ب, ل, ف, ال).
 */
export function highlightArabicWord(text, targetWord) {
  if (!text || !targetWord) return text || '';

  const normTarget = normalizeArabic(targetWord);
  if (!normTarget) return text;

  // Split text into tokens by spaces/punctuation while preserving them
  const tokens = text.split(/([\s,.;:!?،۔«»"']+)/);

  return tokens
    .map(token => {
      // If the token is just whitespace or punctuation, return as-is
      if (/^[\s,.;:!?،۔«»"']+$/.test(token)) {
        return token;
      }

      const normToken = normalizeArabic(token);

      // Check for direct match or prefixed match (like بالبركة, والبركة, للبركة)
      if (
        normToken === normTarget ||
        normToken.endsWith(normTarget) ||
        normToken.includes(normTarget)
      ) {
        return `<mark class="rubric-highlight">${token}</mark>`;
      }

      return token;
    })
    .join('');
}
