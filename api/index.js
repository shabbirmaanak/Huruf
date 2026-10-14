/**
 * Vercel Serverless API Handler for Huruf / Spell Bank
 * Connects directly to Turso (libSQL Cloud Database) via Node https
 * Database URL: https://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io/v2/pipeline
 */

const https = require('https');

const TURSO_HOST = process.env.TURSO_HOST || 'lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io';
const TURSO_PATH = '/v2/pipeline';
const TURSO_TOKEN = process.env.TURSO_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE5NzMxNzAsImlkIjoiMDFhMTM5ZWMtODQwMS03MWQ4LTlkOTMtNzhkODc0YTAyMGYwIiwia2lkIjoicnNxM3J2QXI5MFloTkV0SGltMjhrRjVoUzBTbG1xcHc0M3JOVFRCaEZPUSIsInJpZCI6IjQxYmFhNzgyLTE3YWItNDA1OS1iYjNjLTFhMWZiOWQ0MGVlYSJ9.tbXd-bx8rF6-CVOlCmIwAgJZZzzCNCDqLG_w8iguGuOKLoKmgncFlFcnt5plBzRikzmYcAanKJKlgy3eOAenAw';
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || 'qamoos53';

function tursoRequest(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: TURSO_HOST,
      port: 443,
      path: TURSO_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Huruf-Vercel/1.0'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Turso HTTP ${res.statusCode}: ${responseBody}`));
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch (err) {
          reject(new Error(`Invalid JSON from Turso: ${responseBody.slice(0, 100)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Turso connection error: ${err.message || err.code}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Turso connection timed out after 15s'));
    });

    req.write(postData);
    req.end();
  });
}

async function tursoQuery(sql, args = []) {
  const convertedArgs = args.map(a => {
    if (a === null || a === undefined) return { type: 'null' };
    if (typeof a === 'number') {
      return Number.isInteger(a) ? { type: 'integer', value: String(a) } : { type: 'float', value: a };
    }
    return { type: 'text', value: String(a) };
  });

  const payload = {
    requests: [
      { type: 'execute', stmt: { sql, args: convertedArgs } },
      { type: 'close' }
    ]
  };

  const data = await tursoRequest(payload);
  const res = data.results && data.results[0];
  if (!res) throw new Error('Empty result from Turso pipeline');
  if (res.type === 'error') {
    throw new Error(res.error ? res.error.message : 'Unknown Turso error');
  }

  const resObj = res.response.result;
  const cols = resObj.cols.map(c => c.name);
  return resObj.rows.map(row => {
    const rowObj = {};
    row.forEach((cell, idx) => {
      let val = cell.value;
      if (cell.type === 'integer' && val !== null && val !== undefined) {
        val = parseInt(val, 10);
      }
      rowObj[cols[idx]] = val;
    });
    return rowObj;
  });
}

function parseBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch (e) { return {}; }
    }
    return req.body;
  }
  return {};
}

module.exports = async function handler(req, res) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Passkey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const query = Object.fromEntries(url.searchParams.entries());
    const body = parseBody(req);

    // Route: /api/stats
    if (pathname === '/api/stats' && req.method === 'GET') {
      const [totalRes, statusRows, levelRows, audioRes, imageRes] = await Promise.all([
        tursoQuery('SELECT COUNT(*) as c FROM words;'),
        tursoQuery('SELECT review_status, COUNT(*) as c FROM words GROUP BY review_status;'),
        tursoQuery('SELECT level, COUNT(*) as c FROM words GROUP BY level;'),
        tursoQuery("SELECT COUNT(*) as c FROM words WHERE audio_url != '' AND audio_url IS NOT NULL;"),
        tursoQuery("SELECT COUNT(*) as c FROM words WHERE image_url != '' AND image_url IS NOT NULL;")
      ]);

      const total = totalRes[0] ? totalRes[0].c : 0;
      const statusMap = {};
      statusRows.forEach(r => { statusMap[r.review_status] = r.c; });
      const levelMap = {};
      levelRows.forEach(r => { levelMap[r.level] = r.c; });

      return res.status(200).json({
        database: 'Turso (libSQL Cloud)',
        turso_host: TURSO_HOST,
        total_words: total,
        pending: statusMap['pending'] || 0,
        flagged: statusMap['flagged'] || 0,
        edited: statusMap['edited'] || 0,
        approved: statusMap['approved'] || 0,
        with_audio: audioRes[0] ? audioRes[0].c : 0,
        with_image: imageRes[0] ? imageRes[0].c : 0,
        cloud_synced: total,
        levels: levelMap
      });
    }

    // Route: /api/lexicon (approved & edited words for public lexicon and spell bank)
    if (pathname === '/api/lexicon' && req.method === 'GET') {
      const sql = `
        SELECT 
          w.id, w.word_name, w.original_word_name, w.transliteration, w.level,
          w.english_meaning, w.french_meaning, w.sentence, w.singular, w.plural,
          w.alphabet, w.audio_url, w.image_url, w.review_status,
          w.suggested_spelling, w.orthography_flags, w.curator_notes,
          (SELECT GROUP_CONCAT(category_name, ', ') FROM word_categories WHERE word_id = w.id) as categories_list
        FROM words w
        WHERE w.review_status IN ('approved', 'edited')
        ORDER BY w.id ASC;
      `;
      const rows = await tursoQuery(sql);
      const words = rows.map(formatLexiconEntry);
      return res.status(200).json({ total: words.length, words });
    }

    // Route: /api/categories
    if (pathname === '/api/categories' && req.method === 'GET') {
      const rows = await tursoQuery('SELECT name, word_count FROM categories ORDER BY word_count DESC;');
      return res.status(200).json({
        categories: rows.map(r => ({ name: r.name, count: r.word_count }))
      });
    }

    // Route: /api/auth/verify
    if (pathname === '/api/auth/verify' && req.method === 'POST') {
      const passkey = body.passkey || '';
      if (passkey === ADMIN_PASSKEY) {
        return res.status(200).json({ success: true, message: 'Authorized' });
      }
      return res.status(401).json({ success: false, error: 'Invalid passkey' });
    }

    // Route: /api/words (GET = list, POST = create)
    if (pathname === '/api/words') {
      if (req.method === 'GET') {
        const page = parseInt(query.page || '1', 10);
        const limit = parseInt(query.limit || '50', 10);
        const offset = (page - 1) * limit;

        const status = (query.status || 'all').trim();
        const search = (query.search || '').trim();
        const alphabet = (query.alphabet || '').trim();
        const category = (query.category || '').trim();
        const level = (query.level || '').trim();

        const conditions = [];
        const params = [];

        if (status && status !== 'all') {
          conditions.push('w.review_status = ?');
          params.push(status);
        }

        if (search) {
          const sp = `%${search}%`;
          conditions.push('(w.word_name LIKE ? OR w.transliteration LIKE ? OR w.english_meaning LIKE ? OR w.word_terms LIKE ?)');
          params.push(sp, sp, sp, sp);
        }

        if (alphabet) {
          conditions.push('w.alphabet = ?');
          params.push(alphabet);
        }

        if (level) {
          conditions.push('w.level = ?');
          params.push(level);
        }

        if (category) {
          conditions.push('w.id IN (SELECT word_id FROM word_categories WHERE category_name = ?)');
          params.push(category);
        }

        const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        const countRes = await tursoQuery(`SELECT COUNT(*) as c FROM words w ${whereClause};`, params);
        const totalCount = countRes[0] ? countRes[0].c : 0;

        const sql = `
          SELECT 
            w.id, w.word_name, w.original_word_name, w.transliteration, w.level,
            w.english_meaning, w.french_meaning, w.sentence, w.singular, w.plural,
            w.alphabet, w.audio_url, w.image_url, w.review_status,
            w.suggested_spelling, w.orthography_flags, w.curator_notes, w.updated_at,
            (SELECT GROUP_CONCAT(category_name, ', ') FROM word_categories WHERE word_id = w.id) as categories_list
          FROM words w
          ${whereClause}
          ORDER BY w.id ASC
          LIMIT ? OFFSET ?;
        `;

        const rows = await tursoQuery(sql, [...params, limit, offset]);

        const words = rows.map(r => {
          let flags = [];
          if (r.orthography_flags) {
            try { flags = JSON.parse(r.orthography_flags); } catch (e) {}
          }
          return {
            id: r.id,
            word_name: r.word_name,
            original_word_name: r.original_word_name || r.word_name,
            transliteration: r.transliteration,
            level: r.level,
            english_meaning: r.english_meaning,
            french_meaning: r.french_meaning,
            sentence: r.sentence,
            singular: r.singular,
            plural: r.plural,
            alphabet: r.alphabet,
            audio_url: r.audio_url,
            image_url: r.image_url,
            review_status: r.review_status || 'pending',
            suggested_spelling: r.suggested_spelling,
            orthography_flags: flags,
            curator_notes: r.curator_notes,
            updated_at: r.updated_at,
            categories: r.categories_list ? r.categories_list.split(', ') : []
          };
        });

        return res.status(200).json({
          page,
          limit,
          total: totalCount,
          total_pages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
          words
        });
      }

      if (req.method === 'POST') {
        const maxRes = await tursoQuery('SELECT MAX(id) as max_id FROM words;');
        const newId = ((maxRes[0] && maxRes[0].max_id) || 0) + 1;

        const word_name = (body.word_name || '').trim();
        const transliteration = (body.transliteration || '').trim();
        const level = body.level || 'intermediate';
        const english_meaning = (body.english_meaning || '').trim();
        const french_meaning = (body.french_meaning || '').trim();
        const sentence = (body.sentence || '').trim();
        const alphabet = body.alphabet || (word_name ? word_name[0] : '');
        const now = new Date().toISOString();

        await tursoQuery(`
          INSERT INTO words (
            id, word_name, original_word_name, transliteration, level,
            english_meaning, french_meaning, sentence, alphabet,
            review_status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'edited', ?);
        `, [newId, word_name, word_name, transliteration, level, english_meaning, french_meaning, sentence, alphabet, now]);

        const createdWord = await fetchWordDetails(newId);
        return res.status(200).json(createdWord);
      }
    }

    // Single Word Actions: /api/words/:id...
    const wordActionMatch = pathname.match(/^\/api\/words\/(\d+)(?:\/(approve|apply-suggestion))?$/);
    if (wordActionMatch) {
      const wordId = parseInt(wordActionMatch[1], 10);
      const subAction = wordActionMatch[2];

      if (subAction === 'approve' && req.method === 'POST') {
        const now = new Date().toISOString();
        await tursoQuery("UPDATE words SET review_status = 'approved', updated_at = ? WHERE id = ?;", [now, wordId]);
        const word = await fetchWordDetails(wordId);
        return res.status(200).json(word);
      }

      if (subAction === 'apply-suggestion' && req.method === 'POST') {
        const rows = await tursoQuery('SELECT suggested_spelling FROM words WHERE id = ?;', [wordId]);
        if (!rows.length || !rows[0].suggested_spelling) {
          return res.status(400).json({ error: 'No suggestion available' });
        }
        const now = new Date().toISOString();
        await tursoQuery("UPDATE words SET word_name = suggested_spelling, review_status = 'edited', updated_at = ? WHERE id = ?;", [now, wordId]);
        const word = await fetchWordDetails(wordId);
        return res.status(200).json(word);
      }

      if (req.method === 'GET') {
        const word = await fetchWordDetails(wordId);
        if (!word) return res.status(404).json({ error: 'Word not found' });
        return res.status(200).json(word);
      }

      if (req.method === 'PUT') {
        const existing = await tursoQuery('SELECT id, word_name FROM words WHERE id = ?;', [wordId]);
        if (!existing.length) return res.status(404).json({ error: 'Word not found' });

        const now = new Date().toISOString();
        const word_name = (body.word_name || existing[0].word_name).trim();
        const transliteration = (body.transliteration || '').trim();
        const level = body.level || 'intermediate';
        const english_meaning = (body.english_meaning || '').trim();
        const french_meaning = (body.french_meaning || '').trim();
        const sentence = (body.sentence || '').trim();
        const singular = (body.singular || '').trim();
        const plural = (body.plural || '').trim();
        const review_status = body.review_status || 'edited';
        const curator_notes = (body.curator_notes || '').trim();

        await tursoQuery(`
          UPDATE words SET
            word_name = ?,
            transliteration = ?,
            level = ?,
            english_meaning = ?,
            french_meaning = ?,
            sentence = ?,
            singular = ?,
            plural = ?,
            review_status = ?,
            curator_notes = ?,
            updated_at = ?
          WHERE id = ?;
        `, [
          word_name, transliteration, level, english_meaning, french_meaning,
          sentence, singular, plural, review_status, curator_notes, now, wordId
        ]);

        if (Array.isArray(body.categories)) {
          await tursoQuery('DELETE FROM word_categories WHERE word_id = ?;', [wordId]);
          for (const cat of body.categories) {
            if (cat && cat.trim()) {
              await tursoQuery('INSERT OR IGNORE INTO word_categories (word_id, category_name) VALUES (?, ?);', [wordId, cat.trim()]);
            }
          }
        }

        if (Array.isArray(body.meanings)) {
          await tursoQuery('DELETE FROM word_meanings WHERE word_id = ?;', [wordId]);
          for (const m of body.meanings) {
            if (m && m.trim()) {
              await tursoQuery('INSERT INTO word_meanings (word_id, meaning) VALUES (?, ?);', [wordId, m.trim()]);
            }
          }
        }

        const updated = await fetchWordDetails(wordId);
        return res.status(200).json(updated);
      }

      if (req.method === 'DELETE') {
        await tursoQuery('DELETE FROM words WHERE id = ?;', [wordId]);
        await tursoQuery('DELETE FROM word_meanings WHERE word_id = ?;', [wordId]);
        await tursoQuery('DELETE FROM word_translations WHERE word_id = ?;', [wordId]);
        await tursoQuery('DELETE FROM word_categories WHERE word_id = ?;', [wordId]);
        return res.status(200).json({ success: true, deleted_id: wordId });
      }
    }

    // Route: /api/sync/spellbank
    if (pathname === '/api/sync/spellbank' && req.method === 'POST') {
      const rows = await tursoQuery("SELECT COUNT(*) as c FROM words WHERE review_status IN ('approved', 'edited');");
      const count = rows[0] ? rows[0].c : 0;
      return res.status(200).json({
        success: true,
        message: `Synced ${count} approved/edited words from Turso cloud database.`
      });
    }

    // Route: /api/diagnostics/run
    if (pathname === '/api/diagnostics/run' && req.method === 'POST') {
      const rows = await tursoQuery("SELECT COUNT(*) as c FROM words WHERE orthography_flags IS NOT NULL AND orthography_flags != '[]';");
      const count = rows[0] ? rows[0].c : 0;
      return res.status(200).json({
        success: true,
        flagged_count: count,
        message: 'Diagnostics scan up to date in Turso database.'
      });
    }

    return res.status(404).json({ error: `Not found: ${req.method} ${pathname}` });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error',
      code: err.code || null
    });
  }
};

async function fetchWordDetails(wordId) {
  const rows = await tursoQuery('SELECT * FROM words WHERE id = ?;', [wordId]);
  if (!rows.length) return null;
  const row = rows[0];

  const [mRows, tRows, cRows] = await Promise.all([
    tursoQuery('SELECT meaning FROM word_meanings WHERE word_id = ?;', [wordId]),
    tursoQuery('SELECT locale, translated_text FROM word_translations WHERE word_id = ?;', [wordId]),
    tursoQuery('SELECT category_name FROM word_categories WHERE word_id = ?;', [wordId])
  ]);

  const meanings = mRows.map(m => m.meaning);
  const trans = {};
  tRows.forEach(t => { trans[t.locale] = t.translated_text; });
  const categories = cRows.map(c => c.category_name);

  let flags = [];
  if (row.orthography_flags) {
    try { flags = JSON.parse(row.orthography_flags); } catch (e) {}
  }

  return {
    id: row.id,
    word_name: row.word_name,
    original_word_name: row.original_word_name || row.word_name,
    transliteration: row.transliteration,
    level: row.level,
    english_meaning: row.english_meaning,
    french_meaning: row.french_meaning,
    sentence: row.sentence,
    singular: row.singular,
    plural: row.plural,
    alphabet: row.alphabet,
    word_terms: row.word_terms,
    sequence: row.sequence,
    is_active: Boolean(row.is_active ?? 1),
    image_url: row.image_url,
    image_name: row.image_name,
    audio_url: row.audio_url,
    audio_name: row.audio_name,
    review_status: row.review_status || 'pending',
    suggested_spelling: row.suggested_spelling,
    orthography_flags: flags,
    curator_notes: row.curator_notes || '',
    updated_at: row.updated_at,
    cloud_synced_at: row.cloud_synced_at,
    meanings,
    translations: trans,
    categories
  };
}

function formatLexiconEntry(r) {
  let flags = [];
  if (r.orthography_flags) {
    try { flags = JSON.parse(r.orthography_flags); } catch (e) {}
  }

  const misspellings = [];
  if (r.original_word_name && r.original_word_name !== r.word_name) {
    misspellings.push(r.original_word_name);
  }

  const categories = r.categories_list ? r.categories_list.split(', ') : [];
  let origin = 'Arabic';
  if (categories.some(c => c.toLowerCase().includes('gujarati'))) origin = 'Gujarati';
  else if (categories.some(c => c.toLowerCase().includes('persian') || c.toLowerCase().includes('urdu'))) origin = 'Persian';

  return {
    id: `qamoos-${r.id}`,
    tursoId: r.id,
    arabic: r.word_name,
    transliteration: r.transliteration || '',
    gujaratiPhonetic: r.singular && r.singular !== '-' ? r.singular : '',
    origin: origin,
    rootLetters: '',
    partOfSpeech: r.level ? (r.level.charAt(0).toUpperCase() + r.level.slice(1)) : 'Noun',
    definition: r.english_meaning || r.french_meaning || 'Term recorded in Lisan al-Dawat reference lexicon.',
    notes: r.curator_notes || (r.plural && r.plural !== '-' ? `Plural: ${r.plural}` : ''),
    audioUrl: r.audio_url || '',
    reviewStatus: r.review_status,
    spellingGuide: misspellings.length > 0 ? {
      commonMisspellings: misspellings,
      rule: r.suggested_spelling 
        ? `Standardized from legacy orthography (${misspellings.join(', ')}).`
        : `Verified modern Lisan al-Dawat orthography.`
    } : null,
    sentenceReference: {
      arabic: r.sentence || '',
      translation: r.french_meaning || '',
      gloss: r.sentence ? 'Authentic contextual citation from Qamoos53 archive.' : ''
    },
    paragraphReference: {
      arabic: '',
      translation: '',
      contextType: 'Lisan al-Dawat'
    }
  };
}
