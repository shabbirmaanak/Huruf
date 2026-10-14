#!/usr/bin/env python3
"""
Uploads all 8,587 words, meanings, translations, and categories from local SQLite
to the user's Turso database in batched HTTP pipeline requests.
"""

import sqlite3
import json
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

def turso_batch_execute(statements):
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
                raise Exception(f"Turso Error: {r['error']['message']}")
        return res

def upload_table(conn, table_name, columns, batch_size=150):
    cur = conn.cursor()
    col_str = ', '.join(columns)
    placeholders = ', '.join(['?'] * len(columns))
    insert_sql = f"INSERT OR REPLACE INTO {table_name} ({col_str}) VALUES ({placeholders})"

    cur.execute(f"SELECT {col_str} FROM {table_name}")
    rows = cur.fetchall()
    total = len(rows)
    print(f"\nUploading {table_name} ({total} rows)...")

    batch = []
    sent = 0
    start_time = time.time()

    for r in rows:
        batch.append((insert_sql, list(r)))
        if len(batch) >= batch_size:
            turso_batch_execute(batch)
            sent += len(batch)
            print(f"  {sent}/{total} ({sent*100//total}%) uploaded...", end='\r')
            batch = []

    if batch:
        turso_batch_execute(batch)
        sent += len(batch)

    elapsed = time.time() - start_time
    print(f"  ✓ {sent}/{total} (100%) uploaded in {elapsed:.2f}s")

def main():
    conn = sqlite3.connect(LOCAL_DB)
    
    # 1. Categories
    upload_table(conn, 'categories', ['name', 'word_count'])

    # 2. Meanings
    upload_table(conn, 'meanings', ['id', 'meaning'], batch_size=250)

    # 3. Translations
    upload_table(conn, 'translations', ['id', 'locale', 'word_name', 'transliteration', 'sentence', 'singular', 'plural', 'alphabet', 'word_terms'], batch_size=200)

    # 4. Words (including review_status, orthography_flags, suggested_spelling, original_word_name)
    word_columns = [
        'id', 'word_name', 'original_word_name', 'transliteration', 'level',
        'english_meaning', 'french_meaning', 'sentence', 'singular', 'plural',
        'alphabet', 'word_terms', 'sequence', 'is_active', 'image_url',
        'image_name', 'audio_url', 'audio_name', 'review_status',
        'suggested_spelling', 'orthography_flags', 'curator_notes',
        'updated_at', 'cloud_synced_at'
    ]
    upload_table(conn, 'words', word_columns, batch_size=100)

    # 5. Join tables
    upload_table(conn, 'word_meanings', ['word_id', 'meaning_id', 'meaning'], batch_size=250)
    upload_table(conn, 'word_translations', ['word_id', 'translation_id', 'locale', 'translated_text'], batch_size=250)
    upload_table(conn, 'word_categories', ['word_id', 'category_name'], batch_size=250)

    conn.close()
    print("\n✦ Full database upload to Turso complete!")

if __name__ == '__main__':
    main()
