/**
 * Lisan al-Dawat Editorial Studio & Orthography Desk Controller
 */

(function () {
  'use strict';

  let state = {
    page: 1,
    limit: 50,
    totalPages: 1,
    status: 'all',
    search: '',
    category: '',
    alphabet: '',
    level: '',
    words: [],
    selectedWordId: null,
    currentWord: null,
    audioPlaying: false
  };

  const API_BASE = '';

  // Elements
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const alphabetFilter = document.getElementById('alphabet-filter');
  const levelFilter = document.getElementById('level-filter');
  const statusTabs = document.querySelectorAll('.status-tab');
  const wordListEl = document.getElementById('word-list');
  const pageIndicator = document.getElementById('page-indicator');
  const btnPrevPage = document.getElementById('btn-prev-page');
  const btnNextPage = document.getElementById('btn-next-page');

  // Editor elements
  const heroArabic = document.getElementById('hero-arabic');
  const heroTranslit = document.getElementById('hero-translit');
  const diffOriginal = document.getElementById('diff-original');
  const diffCurrent = document.getElementById('diff-current');
  const diagnosticBanner = document.getElementById('diagnostic-banner');
  const diagTitle = document.getElementById('diag-title');
  const diagMessage = document.getElementById('diag-message');
  const diagSuggestedText = document.getElementById('diag-suggested-text');
  const btnApplySuggestion = document.getElementById('btn-apply-suggestion');

  // Form Fields
  const fieldWordName = document.getElementById('field-word-name');
  const fieldTranslit = document.getElementById('field-transliteration');
  const fieldEnglish = document.getElementById('field-english-meaning');
  const fieldFrench = document.getElementById('field-french-meaning');
  const fieldLisan = document.getElementById('field-lisan-meaning');
  const fieldSentence = document.getElementById('field-sentence');
  const fieldLevel = document.getElementById('field-level');
  const fieldReviewStatus = document.getElementById('field-review-status');
  const fieldSingular = document.getElementById('field-singular');
  const fieldPlural = document.getElementById('field-plural');
  const fieldCategories = document.getElementById('field-categories');
  const fieldCuratorNotes = document.getElementById('field-curator-notes');
  const fieldOrthographyRule = document.getElementById('field-orthography-rule');

  // Buttons & Audio
  const btnPlayAudio = document.getElementById('btn-play-audio');
  const wordAudio = document.getElementById('word-audio');
  const audioContainer = document.getElementById('audio-container');
  const btnPrevWord = document.getElementById('btn-prev-word');
  const btnNextWord = document.getElementById('btn-next-word');
  const btnSaveChanges = document.getElementById('btn-save-changes');
  const btnApproveWord = document.getElementById('btn-approve-word');
  const btnDeleteWord = document.getElementById('btn-delete-word');
  const btnSyncSpellbank = document.getElementById('btn-sync-spellbank');
  const btnRunDiagnostics = document.getElementById('btn-run-diagnostics');
  const btnNewWord = document.getElementById('btn-new-word');

  // Modals
  const authModal = document.getElementById('auth-modal');
  const inputPasskey = document.getElementById('input-passkey');
  const btnVerifyPasscode = document.getElementById('btn-verify-passcode');
  const cloudModal = document.getElementById('cloud-modal');
  const btnCloudModal = document.getElementById('btn-cloud-modal');
  const btnCloseCloudModal = document.getElementById('btn-close-cloud-modal');

  // Toast
  const toastEl = document.getElementById('toast');

  function showToast(msg, duration = 3000) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    toastEl.style.opacity = '1';
    setTimeout(() => {
      toastEl.style.opacity = '0';
      setTimeout(() => { toastEl.style.display = 'none'; }, 200);
    }, duration);
  }

  // Auth Guard: Auto-authenticate and load data immediately
  function initAuth() {
    sessionStorage.setItem('editorial_authenticated', 'true');
    initApp();
  }

  btnVerifyPasscode.addEventListener('click', async () => {
    const key = inputPasskey.value.trim();
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: key })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('editorial_authenticated', 'true');
        authModal.style.display = 'none';
        initApp();
        showToast('✓ Editorial Studio Unlocked');
      } else {
        showToast('Invalid passkey. Please try again.', 4000);
      }
    } catch (err) {
      showToast('Authentication error: ' + err.message, 4000);
    }
  });

  inputPasskey.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnVerifyPasscode.click();
  });

  // App Initialization
  async function initApp() {
    await loadStats();
    await loadCategories();
    await loadWords();
    setupEventListeners();
  }

  // Load Realtime Statistics
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      document.getElementById('stat-total').textContent = (data.total_words || 0).toLocaleString();
      document.getElementById('stat-pending').textContent = (data.pending || 0).toLocaleString();
      document.getElementById('stat-flagged').textContent = (data.flagged || 0).toLocaleString();
      document.getElementById('stat-edited').textContent = (data.edited || 0).toLocaleString();
      document.getElementById('stat-approved').textContent = (data.approved || 0).toLocaleString();
      document.getElementById('stat-audio').textContent = (data.with_audio || 0).toLocaleString();
      document.getElementById('stat-cloud').textContent = (data.cloud_synced || 0).toLocaleString();
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // Load Thematic Categories
  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      categoryFilter.innerHTML = '<option value="">All Categories</option>';
      for (const c of data.categories) {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = `${c.name} (${c.count})`;
        categoryFilter.appendChild(opt);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  // Load Words Directory
  async function loadWords(page = 1) {
    state.page = page;
    const params = new URLSearchParams({
      page: state.page,
      limit: state.limit,
      status: state.status,
      search: state.search,
      category: state.category,
      alphabet: state.alphabet,
      level: state.level
    });

    try {
      const res = await fetch(`/api/words?${params.toString()}`);
      const data = await res.json();
      state.words = data.words;
      state.totalPages = data.total_pages;

      pageIndicator.textContent = `Page ${data.page} of ${data.total_pages || 1} (${data.total.toLocaleString()} words)`;
      btnPrevPage.disabled = data.page <= 1;
      btnNextPage.disabled = data.page >= data.total_pages;

      renderWordList();

      if (state.words.length > 0) {
        // If nothing is selected, select the first word
        const found = state.words.find(w => w.id === state.selectedWordId);
        if (found) {
          selectWord(found.id);
        } else {
          selectWord(state.words[0].id);
        }
      } else {
        wordListEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--ink-muted); font-size:13px;">No words match your filters.</div>';
      }
    } catch (err) {
      console.error('Failed to load words:', err);
    }
  }

  // Render Word List
  function renderWordList() {
    wordListEl.innerHTML = '';
    for (const w of state.words) {
      const item = document.createElement('div');
      item.className = 'word-item' + (w.id === state.selectedWordId ? ' selected' : '');
      item.onclick = () => selectWord(w.id);

      let badgeClass = 'badge-pending';
      let badgeLabel = w.review_status;
      if (w.review_status === 'approved') badgeClass = 'badge-approved';
      else if (w.review_status === 'edited') badgeClass = 'badge-edited';
      else if (w.review_status === 'flagged') badgeClass = 'badge-flagged';

      item.innerHTML = `
        <div class="word-item-info">
          <div class="word-item-arabic">${escapeHtml(w.word_name)}</div>
          <div class="word-item-translit">${escapeHtml(w.transliteration || '—')}</div>
          <div class="word-item-meta">${escapeHtml(w.english_meaning || '')}</div>
        </div>
        <span class="word-item-badge ${badgeClass}">${badgeLabel}</span>
      `;
      wordListEl.appendChild(item);
    }
  }

  // Select and Populate Word Editor
  async function selectWord(id) {
    state.selectedWordId = id;
    renderWordList();

    try {
      const res = await fetch(`/api/words/${id}`);
      const word = await res.json();
      state.currentWord = word;

      // Header breadcrumbs
      document.getElementById('crumb-id').textContent = word.id;
      document.getElementById('crumb-status').textContent = word.review_status.toUpperCase();

      // Hero
      heroArabic.textContent = word.word_name;
      heroTranslit.textContent = word.transliteration || '—';

      // Diff
      diffOriginal.textContent = word.original_word_name || word.word_name;
      diffCurrent.textContent = word.word_name;

      // Audio
      if (word.audio_url) {
        audioContainer.style.display = 'inline-flex';
        wordAudio.src = word.audio_url;
        btnPlayAudio.textContent = '▶';
        state.audioPlaying = false;
      } else {
        audioContainer.style.display = 'none';
        wordAudio.src = '';
      }

      // Diagnostics & Suggestions
      if (word.suggested_spelling && word.suggested_spelling !== word.word_name) {
        diagnosticBanner.style.display = 'block';
        const flags = word.orthography_flags || [];
        diagTitle.textContent = flags.length > 0 ? flags[0].label : 'Orthography Review';
        diagMessage.textContent = flags.length > 0 ? flags[0].message : 'An automated spelling improvement is available for this headword.';
        diagSuggestedText.textContent = word.suggested_spelling;
      } else {
        diagnosticBanner.style.display = 'none';
      }

      // Populate Form
      fieldWordName.value = word.word_name || '';
      fieldTranslit.value = word.transliteration || '';
      fieldEnglish.value = word.english_meaning || '';
      fieldFrench.value = word.french_meaning || '';
      fieldLisan.value = (word.meanings || []).join('\n');
      fieldSentence.value = word.sentence || '';
      fieldLevel.value = word.level || 'intermediate';
      fieldReviewStatus.value = word.review_status || 'pending';
      fieldSingular.value = word.singular || '';
      fieldPlural.value = word.plural || '';
      fieldCategories.value = (word.categories || []).join(', ');
      fieldCuratorNotes.value = word.curator_notes || '';

      if (fieldOrthographyRule) {
        const flags = word.orthography_flags || [];
        if (flags.length > 0) {
          fieldOrthographyRule.value = flags.map(f => f.message).join(' ');
        } else {
          fieldOrthographyRule.value = '';
        }
      }

    } catch (err) {
      console.error('Failed to load word details:', err);
    }
  }

  // Audio Playback
  function toggleAudio() {
    if (!wordAudio.src) return;
    if (wordAudio.paused) {
      wordAudio.play();
      btnPlayAudio.textContent = '❚❚';
      state.audioPlaying = true;
    } else {
      wordAudio.pause();
      btnPlayAudio.textContent = '▶';
      state.audioPlaying = false;
    }
  }

  wordAudio.onended = () => {
    btnPlayAudio.textContent = '▶';
    state.audioPlaying = false;
  };

  btnPlayAudio.addEventListener('click', toggleAudio);

  // Apply Auto-Suggestion
  btnApplySuggestion.addEventListener('click', async () => {
    if (!state.selectedWordId) return;
    try {
      const res = await fetch(`/api/words/${state.selectedWordId}/apply-suggestion`, { method: 'POST' });
      const updated = await res.json();
      showToast(`✓ Applied suggestion: ${updated.word_name}`);
      await selectWord(state.selectedWordId);
      await loadStats();
      await loadWords(state.page);
    } catch (err) {
      showToast('Error applying suggestion: ' + err.message, 4000);
    }
  });

  // Save Word Changes (Update or Create)
  async function saveWord(newStatus = null) {
    const orthographyRule = fieldOrthographyRule ? fieldOrthographyRule.value.trim() : '';
    const internalNotes = fieldCuratorNotes.value.trim();

    const payload = {
      word_name: fieldWordName.value.trim(),
      transliteration: fieldTranslit.value.trim(),
      english_meaning: fieldEnglish.value.trim(),
      french_meaning: fieldFrench.value.trim(),
      meanings: fieldLisan.value.split('\n').map(s => s.trim()).filter(Boolean),
      sentence: fieldSentence.value.trim(),
      level: fieldLevel.value,
      review_status: newStatus || fieldReviewStatus.value,
      singular: fieldSingular.value.trim(),
      plural: fieldPlural.value.trim(),
      categories: fieldCategories.value.split(',').map(s => s.trim()).filter(Boolean),
      orthography_rule: orthographyRule,
      curator_notes: internalNotes
    };

    if (!payload.word_name) {
      showToast('Please enter the Arabic headword.', 4000);
      fieldWordName.focus();
      return;
    }

    try {
      const url = state.selectedWordId ? `/api/words/${state.selectedWordId}` : '/api/words';
      const method = state.selectedWordId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      showToast(`✓ Word ${updated.id} (${updated.word_name}) saved to Turso!`);
      state.selectedWordId = updated.id;
      await selectWord(updated.id);
      await loadStats();
      await loadWords(state.page);
    } catch (err) {
      showToast('Save error: ' + err.message, 4000);
    }
  }

  btnSaveChanges.addEventListener('click', () => saveWord());

  // Mark as Approved
  btnApproveWord.addEventListener('click', async () => {
    await saveWord('approved');
    nextWord();
  });

  // New Word
  btnNewWord.addEventListener('click', () => {
    state.selectedWordId = null;
    state.currentWord = null;
    document.getElementById('crumb-id').textContent = 'NEW';
    document.getElementById('crumb-status').textContent = 'CREATING';
    heroArabic.textContent = 'كلمة جديدة';
    heroTranslit.textContent = 'New Word';
    diffOriginal.textContent = '—';
    diffCurrent.textContent = '—';
    audioContainer.style.display = 'none';
    diagnosticBanner.style.display = 'none';

    fieldWordName.value = '';
    fieldTranslit.value = '';
    fieldEnglish.value = '';
    fieldFrench.value = '';
    fieldLisan.value = '';
    fieldSentence.value = '';
    fieldLevel.value = 'intermediate';
    fieldReviewStatus.value = 'edited';
    fieldSingular.value = '';
    fieldPlural.value = '';
    fieldCategories.value = '';
    fieldCuratorNotes.value = '';
    fieldWordName.focus();
    showToast('Ready to enter new word');
  });

  // Delete Word
  // Delete Word with smooth non-blocking two-step confirmation
  let deleteConfirmTimeout = null;
  btnDeleteWord.addEventListener('click', async () => {
    if (!state.selectedWordId) return;

    if (btnDeleteWord.getAttribute('data-confirming') !== 'true') {
      btnDeleteWord.setAttribute('data-confirming', 'true');
      btnDeleteWord.textContent = 'Confirm Delete?';
      btnDeleteWord.style.background = '#842816';
      btnDeleteWord.style.color = '#fff';
      showToast(`Click again to permanently delete Word #${state.selectedWordId}`);
      deleteConfirmTimeout = setTimeout(() => {
        btnDeleteWord.removeAttribute('data-confirming');
        btnDeleteWord.textContent = 'Delete Word';
        btnDeleteWord.style.background = '';
        btnDeleteWord.style.color = '';
      }, 4000);
      return;
    }

    clearTimeout(deleteConfirmTimeout);
    btnDeleteWord.removeAttribute('data-confirming');
    btnDeleteWord.textContent = 'Deleting...';
    btnDeleteWord.disabled = true;

    try {
      const res = await fetch(`/api/words/${state.selectedWordId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('✓ Word permanently deleted from Turso database');
        state.selectedWordId = null;
        await loadStats();
        await loadWords(state.page);
      }
    } catch (err) {
      showToast('Delete error: ' + err.message, 4000);
    } finally {
      btnDeleteWord.disabled = false;
      btnDeleteWord.textContent = 'Delete Word';
      btnDeleteWord.style.background = '';
      btnDeleteWord.style.color = '';
    }
  });

  // Next / Previous Navigation
  function nextWord() {
    const idx = state.words.findIndex(w => w.id === state.selectedWordId);
    if (idx >= 0 && idx < state.words.length - 1) {
      selectWord(state.words[idx + 1].id);
    } else if (state.page < state.totalPages) {
      loadWords(state.page + 1);
    }
  }

  function prevWord() {
    const idx = state.words.findIndex(w => w.id === state.selectedWordId);
    if (idx > 0) {
      selectWord(state.words[idx - 1].id);
    } else if (state.page > 1) {
      loadWords(state.page - 1);
    }
  }

  btnNextWord.addEventListener('click', nextWord);
  btnPrevWord.addEventListener('click', prevWord);
  btnNextPage.addEventListener('click', () => loadWords(state.page + 1));
  btnPrevPage.addEventListener('click', () => loadWords(state.page - 1));

  // Sync to Public Spell Bank (100% non-blocking, zero INP latency)
  btnSyncSpellbank.addEventListener('click', async () => {
    btnSyncSpellbank.disabled = true;
    btnSyncSpellbank.textContent = 'Syncing...';
    showToast('Syncing approved words with live Spell Bank...');

    try {
      const res = await fetch('/api/sync/spellbank', { method: 'POST' });
      const data = await res.json();
      showToast(data.message || '✓ Synced approved words to live Spell Bank!', 4000);
    } catch (err) {
      showToast('Sync error: ' + err.message, 4000);
    } finally {
      btnSyncSpellbank.disabled = false;
      btnSyncSpellbank.textContent = '✓ Sync Approved to Spell Bank';
    }
  });

  // Run Diagnostics
  btnRunDiagnostics.addEventListener('click', async () => {
    btnRunDiagnostics.disabled = true;
    btnRunDiagnostics.textContent = 'Scanning...';
    try {
      const res = await fetch('/api/diagnostics/run', { method: 'POST' });
      const data = await res.json();
      showToast('✓ Orthography diagnostics completed!');
      await loadStats();
      await loadWords(1);
    } catch (err) {
      showToast('Diagnostics failed: ' + err.message, 4000);
    } finally {
      btnRunDiagnostics.disabled = false;
      btnRunDiagnostics.textContent = '✦ Run Diagnostics';
    }
  });

  // Cloud Status Modal Logic
  btnCloudModal.addEventListener('click', () => {
    cloudModal.style.display = 'flex';
  });

  btnCloseCloudModal.addEventListener('click', () => {
    cloudModal.style.display = 'none';
  });

  // Setup Event Listeners
  function setupEventListeners() {
    // Search input with debounce
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = searchInput.value.trim();
        loadWords(1);
      }, 250);
    });

    categoryFilter.addEventListener('change', () => {
      state.category = categoryFilter.value;
      loadWords(1);
    });

    alphabetFilter.addEventListener('change', () => {
      state.alphabet = alphabetFilter.value;
      loadWords(1);
    });

    levelFilter.addEventListener('change', () => {
      state.level = levelFilter.value;
      loadWords(1);
    });

    statusTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        statusTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.status = tab.getAttribute('data-status');
        loadWords(1);
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

      // Play audio with Spacebar (only when not typing in text field)
      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        toggleAudio();
      }

      // Save: Cmd+S / Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveWord();
      }

      // Approve: Alt+A
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        btnApproveWord.click();
      }

      // Next Word: Alt + Right
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        nextWord();
      }

      // Prev Word: Alt + Left
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        prevWord();
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Start Auth Check
  initAuth();

})();
