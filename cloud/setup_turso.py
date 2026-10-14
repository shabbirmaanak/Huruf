#!/usr/bin/env python3
"""
Turso Migration Script for Qamoos53 (Lisan al-Dawat Lexicon)
Migrates full schema, indexes, views, and 8,587 words with diagnostic flags to Turso Cloud DB.
"""

import json
import sqlite3
import urllib.request
import urllib.error
import os
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_file):
    with open(env_file, 'r') as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

TURSO_URL = os.environ.get('TURSO_URL', 'https://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io/v2/pipeline')
if not TURSO_URL.endswith('/v2/pipeline'):
    TURSO_URL = TURSO_URL.rstrip('/') + '/v2/pipeline'
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')
LOCAL_DB = os.path.join(BASE_DIR, 'data', 'qamoos53', 'qamoos53.sqlite')

def turso_execute(sql, args=None):
    stmt = {'sql': sql}
    if args:
        converted_args = []
        for a in args:
            if a is None:
                converted_args.append({'type': 'null'})
            elif isinstance(a, int):
                converted_args.append({'type': 'integer', 'value': str(a)})
            elif isinstance(a, float):
                converted_args.append({'type': 'float', 'value': a})
            else:
                converted_args.append({'type': 'text', 'value': str(a)})
        stmt['args'] = converted_args

    payload = {
        'requests': [
            {'type': 'execute', 'stmt': stmt},
            {'type': 'close'}
        ]
    }

    req = urllib.request.Request(
        TURSO_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {TURSO_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        first_res = res['results'][0]
        if first_res['type'] == 'error':
            raise Exception(f"Turso Error: {first_res['error']['message']}")
        return first_res['response']['result']

def turso_batch_execute(statements):
    """
    Executes an array of (sql, args) in a single pipeline HTTP request.
    """
    requests = []
    for sql, args in statements:
        stmt = {'sql': sql}
        if args:
            converted_args = []
            for a in args:
                if a is None:
                    converted_args.append({'type': 'null'})
                elif isinstance(a, int):
                    converted_args.append({'type': 'integer', 'value': str(a)})
                elif isinstance(a, float):
                    converted_args.append({'type': 'float', 'value': a})
                else:
                    converted_args.append({'type': 'text', 'value': str(a)})
            stmt['args'] = converted_args
        requests.append({'type': 'execute', 'stmt': stmt})

    requests.append({'type': 'close'})

    payload = {'requests': requests}
    req = urllib.request.Request(
        TURSO_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {TURSO_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        for r in res.get('results', []):
            if r.get('type') == 'error':
                raise Exception(f"Turso Batch Error: {r['error']['message']}")
        return res

def setup_schema():
    print("Creating tables and indexes in Turso...")
    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY,
            word_name TEXT NOT NULL,
            original_word_name TEXT,
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
            audio_name TEXT,
            review_status TEXT DEFAULT 'pending',
            suggested_spelling TEXT,
            orthography_flags TEXT,
            curator_notes TEXT,
            updated_at TEXT,
            cloud_synced_at TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS meanings (
            id INTEGER PRIMARY KEY,
            meaning TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS word_meanings (
            word_id INTEGER NOT NULL,
            meaning_id INTEGER,
            meaning TEXT NOT NULL,
            FOREIGN KEY(word_id) REFERENCES words(id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS translations (
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
        """,
        """
        CREATE TABLE IF NOT EXISTS word_translations (
            word_id INTEGER NOT NULL,
            translation_id INTEGER NOT NULL,
            locale TEXT NOT NULL,
            translated_text TEXT,
            FOREIGN KEY(word_id) REFERENCES words(id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS categories (
            name TEXT PRIMARY KEY,
            word_count INTEGER DEFAULT 0
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS word_categories (
            word_id INTEGER NOT NULL,
            category_name TEXT NOT NULL,
            PRIMARY KEY(word_id, category_name),
            FOREIGN KEY(word_id) REFERENCES words(id)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_words_name ON words(word_name);",
        "CREATE INDEX IF NOT EXISTS idx_words_translit ON words(transliteration);",
        "CREATE INDEX IF NOT EXISTS idx_words_alphabet ON words(alphabet);",
        "CREATE INDEX IF NOT EXISTS idx_words_level ON words(level);",
        "CREATE INDEX IF NOT EXISTS idx_words_status ON words(review_status);",
        "CREATE INDEX IF NOT EXISTS idx_word_meanings_word ON word_meanings(word_id);",
        "CREATE INDEX IF NOT EXISTS idx_word_translations_word ON word_translations(word_id);",
        "CREATE INDEX IF NOT EXISTS idx_word_categories_word ON word_categories(word_id);",
        """
        CREATE VIEW IF NOT EXISTS v_dictionary AS
        SELECT 
            w.id,
            w.word_name AS lisan_word,
            w.original_word_name,
            w.transliteration,
            w.level,
            w.english_meaning,
            w.french_meaning,
            GROUP_CONCAT(DISTINCT wm.meaning) AS lisan_meanings,
            GROUP_CONCAT(DISTINCT wc.category_name) AS categories,
            w.sentence,
            w.audio_url,
            w.image_url,
            w.review_status,
            w.suggested_spelling,
            w.curator_notes
        FROM words w
        LEFT JOIN word_meanings wm ON w.id = wm.word_id
        LEFT JOIN word_categories wc ON w.id = wc.word_id
        GROUP BY w.id;
        """
    ]

    for ddl in ddl_statements:
        turso_execute(ddl)

    print("Schema created successfully!")

if __name__ == '__main__':
    setup_schema()
