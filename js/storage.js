/**
 * Lisan al-Dawat Lexicon & Spell Bank - Storage & Persistence Engine
 * Handles LocalStorage persistence, state machines, and portable JSON export/import.
 */

const SPELL_BANK_KEY = 'lisan_spellbank_v1';
const CUSTOM_LEXICON_KEY = 'lisan_custom_lexicon_v1';

/**
 * Retrieve saved spell bank entries.
 * @returns {Array<{entryId: string, savedAt: string, masteryLevel: 'learning'|'reviewing'|'mastered', notes?: string}>}
 */
export function getSpellBank() {
  try {
    const raw = localStorage.getItem(SPELL_BANK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read spell bank from localStorage', err);
    return [];
  }
}

/**
 * Persist spell bank entries.
 */
export function saveSpellBank(records) {
  try {
    localStorage.setItem(SPELL_BANK_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save spell bank to localStorage', err);
  }
}

/**
 * Get a specific record from the spell bank by entryId.
 */
export function getSpellBankRecord(entryId) {
  const list = getSpellBank();
  return list.find(r => r.entryId === entryId) || null;
}

/**
 * State machine transition for saving or toggling a word in the spell bank:
 * NOT_SAVED -> SAVED (learning) -> NOT_SAVED (or controlled remove)
 */
export function toggleSpellBank(entryId) {
  const list = getSpellBank();
  const index = list.findIndex(r => r.entryId === entryId);

  if (index >= 0) {
    // Remove if already saved
    list.splice(index, 1);
    saveSpellBank(list);
    return null;
  } else {
    // Add as new learning record
    const newRecord = {
      entryId,
      savedAt: new Date().toISOString(),
      masteryLevel: 'learning',
      notes: ''
    };
    list.unshift(newRecord);
    saveSpellBank(list);
    return newRecord;
  }
}

/**
 * Update mastery level: 'learning' | 'reviewing' | 'mastered'
 */
export function updateMasteryLevel(entryId, level) {
  const list = getSpellBank();
  const record = list.find(r => r.entryId === entryId);
  if (record) {
    record.masteryLevel = level;
    record.updatedAt = new Date().toISOString();
    saveSpellBank(list);
    return record;
  }
  return null;
}

/**
 * Retrieve user's custom lexicon entries.
 */
export function getCustomLexicon() {
  try {
    const raw = localStorage.getItem(CUSTOM_LEXICON_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read custom lexicon from localStorage', err);
    return [];
  }
}

/**
 * Persist custom lexicon entries.
 */
export function saveCustomLexicon(entries) {
  try {
    localStorage.setItem(CUSTOM_LEXICON_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Failed to save custom lexicon to localStorage', err);
  }
}

/**
 * Add a new custom entry to the user's lexicon.
 */
export function addCustomEntry(entry) {
  const list = getCustomLexicon();
  list.unshift({
    ...entry,
    isCustom: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  saveCustomLexicon(list);
}

/**
 * Delete a custom entry by ID.
 */
export function deleteCustomEntry(entryId) {
  const list = getCustomLexicon().filter(e => e.id !== entryId);
  saveCustomLexicon(list);

  // Also remove from spell bank if present
  const spellBank = getSpellBank().filter(r => r.entryId !== entryId);
  saveSpellBank(spellBank);
}

/**
 * Export all data (Spell Bank + Custom entries) as a JSON file download.
 */
export function exportDataAsJson() {
  const exportPayload = {
    application: 'Lisan al-Dawat Lexicon & Spell Bank',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    spellBank: getSpellBank(),
    customLexicon: getCustomLexicon()
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `lisan_al_dawat_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import and merge data from a parsed JSON payload.
 * Returns summary statistics of imported items.
 */
export function importDataFromJson(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON file format.');
  }

  let importedCustomCount = 0;
  let importedSpellBankCount = 0;

  // 1. Merge Custom Lexicon
  if (Array.isArray(parsed.customLexicon)) {
    const existing = getCustomLexicon();
    const existingMap = new Map(existing.map(e => [e.id, e]));

    for (const item of parsed.customLexicon) {
      if (item && item.id && item.arabic) {
        existingMap.set(item.id, { ...item, isCustom: true });
        importedCustomCount++;
      }
    }
    saveCustomLexicon(Array.from(existingMap.values()));
  }

  // 2. Merge Spell Bank
  if (Array.isArray(parsed.spellBank)) {
    const existingBank = getSpellBank();
    const bankMap = new Map(existingBank.map(r => [r.entryId, r]));

    for (const record of parsed.spellBank) {
      if (record && record.entryId) {
        bankMap.set(record.entryId, record);
        importedSpellBankCount++;
      }
    }
    saveSpellBank(Array.from(bankMap.values()));
  }

  return {
    importedCustomCount,
    importedSpellBankCount
  };
}
