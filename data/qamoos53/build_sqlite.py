#!/usr/bin/env python3
import json
import sqlite3
import os
import shutil

base_dir = '/Users/shabbirmaanak/Documents/Spell Bank/data/qamoos53'
scratch_dir = '/Users/shabbirmaanak/.gemini/antigravity/brain/4e029ed6-d973-4218-bc9d-1807a5636b1f/scratch/extracted/assets'

sqlite_path = os.path.join(base_dir, 'qamoos53.sqlite')
if os.path.exists(sqlite_path):
    os.remove(sqlite_path)

conn = sqlite3.connect(sqlite_path)
cur = conn.cursor()

# Create Tables
cur.executescript('''
CREATE TABLE words (
    id INTEGER PRIMARY KEY,
    word_name TEXT NOT NULL,
    transliteration TEXT,
    level TEXT,
    english_meaning TEXT,
    french_meaning TEXT,
    sentence TEXT,
    singular TEXT,
    plural TEXT,
    alphabet TEXT,
    word_terms TEXT,
    sequence TEXT,
    is_active INTEGER DEFAULT 1,
    image_url TEXT,
    image_name TEXT,
    audio_url TEXT,
    audio_name TEXT
);

CREATE TABLE meanings (
    id INTEGER PRIMARY KEY,
    meaning TEXT NOT NULL
);

CREATE TABLE word_meanings (
    word_id INTEGER NOT NULL,
    meaning_id INTEGER,
    meaning TEXT NOT NULL,
    FOREIGN KEY(word_id) REFERENCES words(id)
);

CREATE TABLE translations (
    id INTEGER PRIMARY KEY,
    locale TEXT NOT NULL,
    word_name TEXT,
    transliteration TEXT,
    sentence TEXT,
    singular TEXT,
    plural TEXT,
    alphabet TEXT,
    word_terms TEXT
);

CREATE TABLE word_translations (
    word_id INTEGER NOT NULL,
    translation_id INTEGER NOT NULL,
    locale TEXT NOT NULL,
    translated_text TEXT,
    FOREIGN KEY(word_id) REFERENCES words(id)
);

CREATE TABLE categories (
    name TEXT PRIMARY KEY,
    word_count INTEGER DEFAULT 0
);

CREATE TABLE word_categories (
    word_id INTEGER NOT NULL,
    category_name TEXT NOT NULL,
    PRIMARY KEY(word_id, category_name),
    FOREIGN KEY(word_id) REFERENCES words(id)
);

CREATE INDEX idx_words_name ON words(word_name);
CREATE INDEX idx_words_translit ON words(transliteration);
CREATE INDEX idx_words_alphabet ON words(alphabet);
CREATE INDEX idx_words_level ON words(level);
CREATE INDEX idx_word_meanings_word ON word_meanings(word_id);
CREATE INDEX idx_word_translations_word ON word_translations(word_id);
CREATE INDEX idx_word_categories_word ON word_categories(word_id);
CREATE INDEX idx_word_categories_cat ON word_categories(category_name);

CREATE VIEW v_dictionary AS
SELECT 
    w.id,
    w.word_name AS lisan_word,
    w.transliteration,
    w.level,
    w.english_meaning,
    w.french_meaning,
    GROUP_CONCAT(DISTINCT wm.meaning) AS lisan_meanings,
    GROUP_CONCAT(DISTINCT wc.category_name) AS categories,
    w.sentence,
    w.audio_url,
    w.image_url
FROM words w
LEFT JOIN word_meanings wm ON w.id = wm.word_id
LEFT JOIN word_categories wc ON w.id = wc.word_id
GROUP BY w.id;
''')

# Load full words
words_path = os.path.join(base_dir, 'qamoos_words.json')
with open(words_path, 'r', encoding='utf-8') as f:
    words = json.load(f)

for w in words:
    cur.execute('''
    INSERT INTO words (
        id, word_name, transliteration, level, english_meaning, french_meaning,
        sentence, singular, plural, alphabet, word_terms, sequence, is_active,
        image_url, image_name, audio_url, audio_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        w['id'], w['word_name'], w['transliteration'], w['level'],
        w['english_meaning'], w['french_meaning'], w['sentence'],
        w['singular'], w['plural'], w['alphabet'], w['word_terms'],
        w['sequence'], 1 if w['is_active'] else 0,
        w['image_url'], w['image_name'], w['audio_url'], w['audio_name']
    ))

    # Meanings
    for m in w.get('meanings', []):
        cur.execute('INSERT INTO word_meanings (word_id, meaning_id, meaning) VALUES (?, ?, ?)',
                    (w['id'], m['id'], m['meaning']))

    # Translations
    for t in w.get('translations', []):
        cur.execute('''
        INSERT INTO word_translations (word_id, translation_id, locale, translated_text)
        VALUES (?, ?, ?, ?)
        ''', (w['id'], t['id'], t['locale'], t['word_name']))

    # Categories
    for c in w.get('categories', []):
        cur.execute('INSERT OR IGNORE INTO word_categories (word_id, category_name) VALUES (?, ?)',
                    (w['id'], c))

# Load raw meanings
with open(os.path.join(base_dir, 'raw', 'meanings.json'), 'r', encoding='utf-8') as f:
    raw_meanings = json.load(f)
for m in raw_meanings:
    cur.execute('INSERT OR IGNORE INTO meanings (id, meaning) VALUES (?, ?)', (m['id'], m['meaning']))

# Load raw translations
with open(os.path.join(base_dir, 'raw', 'translations.json'), 'r', encoding='utf-8') as f:
    raw_trans = json.load(f)
for t in raw_trans:
    cur.execute('''
    INSERT OR IGNORE INTO translations (id, locale, word_name, transliteration, sentence, singular, plural, alphabet, word_terms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (t['id'], t['locale'], t['word_name'], t['transliteration'], t['sentence'], t['singular'], t['plural'], t['alphabet'], t['word_terms']))

# Update category counts
with open(os.path.join(base_dir, 'qamoos_categories.json'), 'r', encoding='utf-8') as f:
    categories = json.load(f)
for c in categories:
    cur.execute('INSERT INTO categories (name, word_count) VALUES (?, ?)', (c['name'], c['word_count']))

conn.commit()
conn.close()
print("SQLite database successfully created at:", sqlite_path)

# Copy original realm file
orig_realm = os.path.join(scratch_dir, 'qamoos.realm')
dest_realm = os.path.join(base_dir, 'qamoos.realm')
if os.path.exists(orig_realm):
    shutil.copy2(orig_realm, dest_realm)
    print("Copied qamoos.realm to:", dest_realm)

# Copy fonts
fonts_src = os.path.join(scratch_dir, 'fonts')
fonts_dest = os.path.join(base_dir, 'fonts')
os.makedirs(fonts_dest, exist_ok=True)
if os.path.exists(fonts_src):
    for fn in os.listdir(fonts_src):
        if fn.endswith('.ttf') or fn.endswith('.TTF'):
            shutil.copy2(os.path.join(fonts_src, fn), os.path.join(fonts_dest, fn))
    print("Copied fonts to:", fonts_dest)

custom_fonts = os.path.join(scratch_dir, 'custom')
if os.path.exists(custom_fonts):
    for fn in os.listdir(custom_fonts):
        if fn.endswith('.ttf') or fn.endswith('.TTF'):
            shutil.copy2(os.path.join(custom_fonts, fn), os.path.join(fonts_dest, fn))
    print("Copied custom fonts to:", fonts_dest)
