/**
 * Lisan al-Dawat Lexicon & Spell Bank - Core Application Controller
 * Orchestrates multi-script search, editorial card rendering,
 * orthography coaching, custom entry creation, and portable synchronization.
 */

import { SEED_LEXICON } from '../data/seed.js';
import {
  normalizeArabic,
  normalizeTransliteration,
  scoreMatch,
  highlightArabicWord,
  isArabicScript
} from './normalize.js';
import {
  getSpellBank,
  toggleSpellBank,
  updateMasteryLevel,
  getSpellBankRecord,
  getCustomLexicon,
  addCustomEntry,
  deleteCustomEntry,
  exportDataAsJson,
  importDataFromJson
} from './storage.js';

// Application State
const state = {
  searchQuery: '',
  activeTab: 'all', // 'all' | 'spellbank'
  originFilter: 'all', // 'all' | 'Arabic' | 'Persian' | 'Gujarati' | 'Compound'
  masteryFilter: 'all', // 'all' | 'learning' | 'reviewing' | 'mastered'
  customEntries: [],
  spellBankRecords: []
};

// DOM Element References
const dom = {
  searchInput: document.getElementById('search-input'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  searchShortcutHint: document.getElementById('search-shortcut-hint'),
  tabAll: document.getElementById('tab-all'),
  tabSpellBank: document.getElementById('tab-spellbank'),
  countAll: document.getElementById('count-all'),
  countSpellBank: document.getElementById('count-spellbank'),
  originPills: document.querySelectorAll('.origin-pills .pill-btn'),
  spellBankSubfilters: document.getElementById('spellbank-subfilters'),
  masteryPills: document.querySelectorAll('#spellbank-subfilters .pill-btn'),
  lexiconList: document.getElementById('lexicon-list'),
  emptyState: document.getElementById('empty-state'),
  emptyTitle: document.getElementById('empty-title'),
  emptyMessage: document.getElementById('empty-message'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  // Drawer & Form
  addWordBtn: document.getElementById('add-word-btn'),
  addWordDrawer: document.getElementById('add-word-drawer'),
  drawerOverlay: document.getElementById('drawer-overlay'),
  closeDrawerBtn: document.getElementById('close-drawer-btn'),
  cancelDrawerBtn: document.getElementById('cancel-drawer-btn'),
  saveWordBtn: document.getElementById('save-word-btn'),
  addWordForm: document.getElementById('add-word-form'),
  // Sync
  exportBtn: document.getElementById('export-btn'),
  importTriggerBtn: document.getElementById('import-trigger-btn'),
  importFileInput: document.getElementById('import-file-input'),
  // Toast
  toastNotice: document.getElementById('toast-notice'),
  toastMessage: document.getElementById('toast-message')
};

/**
 * Initialize Application
 */
function initApp() {
  state.customEntries = getCustomLexicon();
  state.spellBankRecords = getSpellBank();

  setupEventListeners();
  render();
}

/**
 * Get unified lexicon combining curated seed and user additions
 */
function getActiveLexicon() {
  return [...state.customEntries, ...SEED_LEXICON];
}

/**
 * Filter and sort lexicon entries based on current search & filter state
 */
function getFilteredLexicon() {
  const allEntries = getActiveLexicon();
  const spellBankMap = new Map(state.spellBankRecords.map(r => [r.entryId, r]));

  // 1. Filter by Tab (All vs Spell Bank)
  let list = allEntries.filter(entry => {
    if (state.activeTab === 'spellbank') {
      const record = spellBankMap.get(entry.id);
      if (!record) return false;

      // Filter by Mastery Level within Spell Bank
      if (state.masteryFilter !== 'all') {
        return record.masteryLevel === state.masteryFilter;
      }
      return true;
    }
    return true;
  });

  // 2. Filter by Etymological Origin
  if (state.originFilter !== 'all') {
    list = list.filter(entry => {
      if (state.originFilter === 'Arabic') return entry.origin.toLowerCase().includes('arabic');
      if (state.originFilter === 'Persian') return entry.origin.toLowerCase().includes('persian') || entry.origin.toLowerCase().includes('urdu');
      if (state.originFilter === 'Gujarati') return entry.origin.toLowerCase().includes('gujarati');
      if (state.originFilter === 'Compound') return entry.origin.toLowerCase().includes('compound');
      return true;
    });
  }

  // 3. Search and Score Matching
  if (state.searchQuery.trim()) {
    const scoredList = [];
    for (const entry of list) {
      const score = scoreMatch(entry, state.searchQuery);
      if (score > 0) {
        scoredList.push({ entry, score });
      }
    }

    // Sort by search match score descending
    scoredList.sort((a, b) => b.score - a.score);
    return scoredList.map(item => item.entry);
  }

  // Default sorting: Custom entries first, then alphabetical by transliteration
  return list.sort((a, b) => {
    if (a.isCustom && !b.isCustom) return -1;
    if (!a.isCustom && b.isCustom) return 1;
    return a.transliteration.localeCompare(b.transliteration);
  });
}

/**
 * Master Render Routine
 */
function render() {
  const allEntries = getActiveLexicon();
  const filteredList = getFilteredLexicon();

  // Update Badge Counts
  dom.countAll.textContent = allEntries.length;
  dom.countSpellBank.textContent = state.spellBankRecords.length;

  // Toggle Spell Bank Sub-Filters Visibility
  if (state.activeTab === 'spellbank') {
    dom.spellBankSubfilters.classList.add('visible');
  } else {
    dom.spellBankSubfilters.classList.remove('visible');
  }

  // Handle Empty State
  if (filteredList.length === 0) {
    dom.lexiconList.innerHTML = '';
    dom.emptyState.style.display = 'block';

    if (state.activeTab === 'spellbank' && state.spellBankRecords.length === 0) {
      dom.emptyTitle.textContent = 'Your Spell Bank is Empty';
      dom.emptyMessage.textContent = 'Bookmark terms from the main lexicon to practice spellings, track mastery, and review classical usage.';
    } else {
      dom.emptyTitle.textContent = 'No Terms Found';
      dom.emptyMessage.textContent = `No vocabulary matches "${state.searchQuery}". Try searching in Arabic, Gujarati, or English definitions.`;
    }
    return;
  }

  dom.emptyState.style.display = 'none';

  // Render Word Cards
  dom.lexiconList.innerHTML = filteredList.map(entry => renderWordCard(entry)).join('');
}

/**
 * Render an individual editorial Word Card conforming to Section 5.1
 */
function renderWordCard(entry) {
  const spellRecord = state.spellBankRecords.find(r => r.entryId === entry.id);
  const isSaved = !!spellRecord;
  const mastery = spellRecord ? spellRecord.masteryLevel : 'learning';

  // Highlight target word in sentences and paragraphs
  const highlightedSentence = highlightArabicWord(entry.sentenceReference.arabic, entry.arabic);
  const highlightedParagraph = highlightArabicWord(entry.paragraphReference.arabic, entry.arabic);

  // Render Spelling Pitfall Guide if available
  let spellingGuideHtml = '';
  if (entry.spellingGuide) {
    const misspellings = entry.spellingGuide.commonMisspellings
      .map(m => `<span class="misspelling-item" title="Common error: Avoid this spelling">${m}</span>`)
      .join('<span style="color: var(--ink-muted); font-size: 0.9rem;"> · </span>');

    spellingGuideHtml = `
      <div class="spelling-guide-block">
        <div class="spelling-guide-header">
          <span class="spelling-guide-label">Orthographic Alert</span>
          <div class="misspelled-variants">${misspellings}</div>
        </div>
        <p class="spelling-rule">${entry.spellingGuide.rule}</p>
      </div>
    `;
  }

  // Render Root badge if present
  const rootHtml = entry.rootLetters 
    ? `<span class="root-letters" title="Etymological Root (جذر)">[${entry.rootLetters}]</span>`
    : '';

  // Render Custom delete action if user created it
  const customDeleteBtn = entry.isCustom 
    ? `<button class="btn-text delete-custom-btn" data-entry-id="${entry.id}" title="Delete custom word" style="font-size: 0.75rem; color: var(--accent-crimson);">Delete Entry</button>`
    : '';

  return `
    <article class="word-card" id="card-${entry.id}">
      <!-- Card Header -->
      <div class="card-header">
        <div class="card-titles">
          <div class="arabic-headword-wrap">
            <h2 class="arabic-headword">${entry.arabic}</h2>
            ${entry.gujaratiPhonetic ? `<span class="gujarati-phonetic">(${entry.gujaratiPhonetic})</span>` : ''}
          </div>
          <div class="translit-and-pos">
            <span class="transliteration">${entry.transliteration}</span>
            <span class="pos-tag">${entry.partOfSpeech}</span>
            <span class="origin-badge">✦ ${entry.origin} ${rootHtml}</span>
            ${entry.isCustom ? `<span class="pos-tag" style="background-color: var(--accent-soft); color: var(--accent-crimson);">Custom</span>` : ''}
          </div>
        </div>

        <div class="card-top-actions">
          <button 
            class="spellbank-toggle-btn ${isSaved ? 'saved' : ''}" 
            data-entry-id="${entry.id}"
            title="${isSaved ? 'Remove from Spell Bank' : 'Save to Spell Bank for orthography practice'}"
          >
            ${isSaved ? '★ In Spell Bank' : '✦ Add to Spell Bank'}
          </button>
        </div>
      </div>

      <!-- Definition & Editorial Notes -->
      <div class="card-definition-block">
        <p class="definition-text">${entry.definition}</p>
        ${entry.notes ? `<p class="editorial-notes">${entry.notes}</p>` : ''}
      </div>

      <!-- Orthography & Spelling Pitfalls -->
      ${spellingGuideHtml}

      <!-- Dual-Tier Context Blocks -->
      <div class="context-references">
        <!-- Tier 1: Sentence Reference -->
        <div class="reference-card tier-1">
          <div class="reference-header">
            <span class="tier-label">
              <span>Tier 1 · Sentence Context</span>
            </span>
            <span class="tier-arabic-title">مثال في الجملة</span>
          </div>
          <p class="arabic-reference-text">${highlightedSentence}</p>
          <p class="translation-text">${entry.sentenceReference.translation}</p>
          ${entry.sentenceReference.gloss ? `<p class="gloss-text">Grammatical Gloss: ${entry.sentenceReference.gloss}</p>` : ''}
        </div>

        <!-- Tier 2: Passage Reference -->
        <div class="reference-card tier-2">
          <div class="reference-header">
            <span class="tier-label">
              <span>Tier 2 · Textual Passage</span>
            </span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="context-type-badge">${entry.paragraphReference.contextType}</span>
              <span class="tier-arabic-title">سياق العبارة</span>
            </div>
          </div>
          <p class="arabic-reference-text">${highlightedParagraph}</p>
          <p class="translation-text">${entry.paragraphReference.translation}</p>
        </div>
      </div>

      <!-- Card Bottom Strip -->
      <div class="card-bottom-strip">
        <div class="mastery-status-selector">
          ${isSaved ? `
            <span class="status-label">Mastery:</span>
            <select class="mastery-select" data-entry-id="${entry.id}">
              <option value="learning" ${mastery === 'learning' ? 'selected' : ''}>Learning (جاري الحفظ)</option>
              <option value="reviewing" ${mastery === 'reviewing' ? 'selected' : ''}>Reviewing (مراجعة)</option>
              <option value="mastered" ${mastery === 'mastered' ? 'selected' : ''}>Mastered (متقن)</option>
            </select>
          ` : `
            <span class="status-label" style="font-style: italic;">Not in Spell Bank</span>
          `}
          ${customDeleteBtn}
        </div>

        <button class="copy-arabic-btn" data-arabic="${entry.arabic}" title="Copy Arabic text to clipboard">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy Arabic
        </button>
      </div>
    </article>
  `;
}

/**
 * Setup All Application Event Listeners
 */
function setupEventListeners() {
  // 1. Search Bar Interactions
  dom.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.searchQuery.length > 0) {
      dom.clearSearchBtn.style.display = 'block';
      dom.searchShortcutHint.style.display = 'none';
    } else {
      dom.clearSearchBtn.style.display = 'none';
      dom.searchShortcutHint.style.display = 'flex';
    }
    render();
  });

  dom.clearSearchBtn.addEventListener('click', () => {
    dom.searchInput.value = '';
    state.searchQuery = '';
    dom.clearSearchBtn.style.display = 'none';
    dom.searchShortcutHint.style.display = 'flex';
    dom.searchInput.focus();
    render();
  });

  // 2. Tab Navigation
  dom.tabAll.addEventListener('click', () => {
    state.activeTab = 'all';
    dom.tabAll.classList.add('active');
    dom.tabSpellBank.classList.remove('active');
    render();
  });

  dom.tabSpellBank.addEventListener('click', () => {
    state.activeTab = 'spellbank';
    dom.tabSpellBank.classList.add('active');
    dom.tabAll.classList.remove('active');
    render();
  });

  // 3. Etymological Origin Filter Pills
  dom.originPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dom.originPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.originFilter = pill.getAttribute('data-origin');
      render();
    });
  });

  // 4. Spell Bank Mastery Sub-Filters
  dom.masteryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dom.masteryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.masteryFilter = pill.getAttribute('data-mastery');
      render();
    });
  });

  // 5. Reset Filters
  dom.resetFiltersBtn.addEventListener('click', () => {
    state.searchQuery = '';
    state.originFilter = 'all';
    state.masteryFilter = 'all';
    dom.searchInput.value = '';
    dom.clearSearchBtn.style.display = 'none';
    dom.searchShortcutHint.style.display = 'flex';

    dom.originPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-origin') === 'all'));
    dom.masteryPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-mastery') === 'all'));
    render();
  });

  // 6. Global Click Delegation for Word Cards
  dom.lexiconList.addEventListener('click', (e) => {
    // Spell Bank Toggle
    const toggleBtn = e.target.closest('.spellbank-toggle-btn');
    if (toggleBtn) {
      const entryId = toggleBtn.getAttribute('data-entry-id');
      const updatedRecord = toggleSpellBank(entryId);
      state.spellBankRecords = getSpellBank();
      
      const entry = getActiveLexicon().find(w => w.id === entryId);
      const wordName = entry ? entry.transliteration : 'Word';

      if (updatedRecord) {
        showToast(`Added "${wordName}" to your Spell Bank.`);
      } else {
        showToast(`Removed "${wordName}" from your Spell Bank.`);
      }
      render();
      return;
    }

    // Copy Arabic Headword
    const copyBtn = e.target.closest('.copy-arabic-btn');
    if (copyBtn) {
      const arabicText = copyBtn.getAttribute('data-arabic');
      if (arabicText) {
        navigator.clipboard.writeText(arabicText).then(() => {
          showToast(`Copied "${arabicText}" to clipboard.`);
        }).catch(err => {
          console.error('Clipboard copy failed', err);
          showToast(`Selected: ${arabicText}`);
        });
      }
      return;
    }

    // Delete Custom Entry
    const deleteBtn = e.target.closest('.delete-custom-btn');
    if (deleteBtn) {
      const entryId = deleteBtn.getAttribute('data-entry-id');
      if (confirm('Are you sure you want to permanently delete this custom entry?')) {
        deleteCustomEntry(entryId);
        state.customEntries = getCustomLexicon();
        state.spellBankRecords = getSpellBank();
        showToast('Custom entry deleted.');
        render();
      }
      return;
    }
  });

  // 7. Mastery Status Select Change
  dom.lexiconList.addEventListener('change', (e) => {
    const select = e.target.closest('.mastery-select');
    if (select) {
      const entryId = select.getAttribute('data-entry-id');
      const newLevel = select.value;
      updateMasteryLevel(entryId, newLevel);
      state.spellBankRecords = getSpellBank();
      showToast(`Mastery status updated to ${newLevel}.`);
      render();
    }
  });

  // 8. Add Word Drawer Open / Close
  dom.addWordBtn.addEventListener('click', openAddWordDrawer);
  dom.closeDrawerBtn.addEventListener('click', closeAddWordDrawer);
  dom.cancelDrawerBtn.addEventListener('click', closeAddWordDrawer);
  dom.drawerOverlay.addEventListener('click', closeAddWordDrawer);

  // 9. Add Word Form Submission
  dom.saveWordBtn.addEventListener('click', handleSaveNewWord);

  // 10. Portable JSON Export & Import
  dom.exportBtn.addEventListener('click', () => {
    exportDataAsJson();
    showToast('Exporting lexicon and spell bank as JSON backup.');
  });

  dom.importTriggerBtn.addEventListener('click', () => {
    dom.importFileInput.click();
  });

  dom.importFileInput.addEventListener('change', handleFileImport);

  // 11. Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Focus search on '/'
    if (e.key === '/' && document.activeElement !== dom.searchInput && !dom.addWordDrawer.classList.contains('active')) {
      e.preventDefault();
      dom.searchInput.focus();
      return;
    }

    // Escape closes search or drawer
    if (e.key === 'Escape') {
      if (dom.addWordDrawer.classList.contains('active')) {
        closeAddWordDrawer();
      } else if (dom.searchInput === document.activeElement) {
        dom.searchInput.blur();
      }
    }
  });
}

/**
 * Open Add Word Drawer
 */
function openAddWordDrawer() {
  dom.addWordDrawer.classList.add('active');
  dom.drawerOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('input-arabic').focus();
}

/**
 * Close Add Word Drawer
 */
function closeAddWordDrawer() {
  dom.addWordDrawer.classList.remove('active');
  dom.drawerOverlay.classList.remove('active');
  document.body.style.overflow = '';
  dom.addWordForm.reset();
  hideFormErrors();
}

/**
 * Hide form validation error indicators
 */
function hideFormErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
}

/**
 * Validate and Save New Word Entry (Section 4.3)
 */
function handleSaveNewWord() {
  hideFormErrors();

  const arabic = document.getElementById('input-arabic').value.trim();
  const transliteration = document.getElementById('input-transliteration').value.trim();
  const gujarati = document.getElementById('input-gujarati').value.trim();
  const pos = document.getElementById('input-pos').value;
  const origin = document.getElementById('input-origin').value;
  const root = document.getElementById('input-root').value.trim();
  const definition = document.getElementById('input-definition').value.trim();
  const notes = document.getElementById('input-notes').value.trim();
  const misspellingsRaw = document.getElementById('input-misspellings').value.trim();
  const spellingRule = document.getElementById('input-spelling-rule').value.trim();
  const sentenceAr = document.getElementById('input-sentence-arabic').value.trim();
  const sentenceTr = document.getElementById('input-sentence-trans').value.trim();
  const paraContext = document.getElementById('input-para-context').value;
  const paraAr = document.getElementById('input-para-arabic').value.trim();
  const paraTr = document.getElementById('input-para-trans').value.trim();

  // Validation according to Section 4.3
  let hasError = false;

  if (!arabic || !isArabicScript(arabic)) {
    document.getElementById('error-arabic').style.display = 'block';
    hasError = true;
  }

  if (!transliteration) {
    document.getElementById('error-transliteration').style.display = 'block';
    hasError = true;
  }

  if (!definition) {
    document.getElementById('error-definition').style.display = 'block';
    hasError = true;
  }

  if (!sentenceAr) {
    document.getElementById('error-sentence').style.display = 'block';
    hasError = true;
  }

  if (!paraAr) {
    document.getElementById('error-para').style.display = 'block';
    hasError = true;
  }

  if (hasError) return;

  // Deduplication check
  const activeLexicon = getActiveLexicon();
  const normAr = normalizeArabic(arabic);
  const normTr = normalizeTransliteration(transliteration);

  const duplicate = activeLexicon.find(w => 
    w.arabicNormalized === normAr || normalizeTransliteration(w.transliteration) === normTr
  );

  if (duplicate) {
    const proceed = confirm(
      `An entry for "${duplicate.transliteration}" (${duplicate.arabic}) already exists in the lexicon.\n\nDo you still wish to add this as an alternate entry?`
    );
    if (!proceed) return;
  }

  // Parse spelling guide misspellings
  const misspellings = misspellingsRaw
    ? misspellingsRaw.split(/[,،]+/).map(s => s.trim()).filter(Boolean)
    : [];

  const newEntry = {
    id: transliteration.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36),
    arabic,
    arabicNormalized: normAr,
    transliteration,
    gujaratiPhonetic: gujarati,
    origin,
    rootLetters: root || undefined,
    partOfSpeech: pos,
    definition,
    notes,
    spellingGuide: (misspellings.length > 0 || spellingRule) ? {
      commonMisspellings: misspellings,
      rule: spellingRule || 'Observe authentic Arabic root spelling conventions.'
    } : undefined,
    sentenceReference: {
      arabic: sentenceAr,
      translation: sentenceTr || 'No translation provided.',
      gloss: undefined
    },
    paragraphReference: {
      arabic: paraAr,
      translation: paraTr || 'No translation provided.',
      contextType: paraContext
    }
  };

  addCustomEntry(newEntry);
  state.customEntries = getCustomLexicon();

  closeAddWordDrawer();
  showToast(`Added "${transliteration}" to your personal lexicon.`);

  // Switch to "All Words" tab to display the new entry
  state.activeTab = 'all';
  dom.tabAll.classList.add('active');
  dom.tabSpellBank.classList.remove('active');
  render();

  // Smooth scroll to the newly created card
  setTimeout(() => {
    const card = document.getElementById(`card-${newEntry.id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--accent-crimson)';
      setTimeout(() => card.style.outline = 'none', 2000);
    }
  }, 100);
}

/**
 * Handle Portable JSON File Import
 */
function handleFileImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result);
      const result = importDataFromJson(data);

      state.customEntries = getCustomLexicon();
      state.spellBankRecords = getSpellBank();

      showToast(`Imported ${result.importedCustomCount} words and ${result.importedSpellBankCount} spell bank records.`);
      render();
    } catch (err) {
      console.error('Import error', err);
      alert('Failed to import file: Invalid or corrupted JSON backup format.');
    } finally {
      dom.importFileInput.value = '';
    }
  };
  reader.readAsText(file);
}

/**
 * Display Editorial Toast Notification
 */
let toastTimeout;
function showToast(message, duration = 3200) {
  if (toastTimeout) clearTimeout(toastTimeout);

  dom.toastMessage.textContent = message;
  dom.toastNotice.classList.add('show');

  toastTimeout = setTimeout(() => {
    dom.toastNotice.classList.remove('show');
  }, duration);
}

// Bootstrap Application on DOM Ready
document.addEventListener('DOMContentLoaded', initApp);
