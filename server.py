#!/usr/bin/env python3
"""
Lisan al-Dawat Editorial Studio & Cloud Sync Server
Powered directly by Turso (libSQL Cloud Database)
URL: https://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io
"""

import http.server
import socketserver
import json
import sqlite3
import urllib.parse
import urllib.request
import urllib.error
import os
import sys
import subprocess
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_dotenv():
    env_file = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

load_dotenv()

PORT = int(os.environ.get('PORT', 8053))
CLOUD_CONFIG_PATH = os.path.join(BASE_DIR, 'cloud', 'cloud_config.json')
LOCAL_DB_PATH = os.path.join(BASE_DIR, 'data', 'qamoos53', 'qamoos53.sqlite')

# Default admin passkey (can be overridden via env ADMIN_PASSKEY)
ADMIN_PASSKEY = os.environ.get('ADMIN_PASSKEY', 'qamoos53')

TURSO_URL = os.environ.get('TURSO_URL', 'https://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io/v2/pipeline')
if not TURSO_URL.endswith('/v2/pipeline'):
    TURSO_URL = TURSO_URL.rstrip('/') + '/v2/pipeline'
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')

class TursoDB:
    def __init__(self, url=TURSO_URL, token=TURSO_TOKEN):
        self.url = url
        self.token = token

    def query(self, sql, args=None):
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

        payload = {'requests': [{'type': 'execute', 'stmt': stmt}, {'type': 'close'}]}
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            res = data['results'][0]
            if res.get('type') == 'error':
                raise Exception(res['error']['message'])
            res_obj = res['response']['result']
            cols = [c['name'] for c in res_obj['cols']]
            rows = []
            for raw_row in res_obj['rows']:
                row_dict = {}
                for idx, cell in enumerate(raw_row):
                    val = cell.get('value')
                    if cell.get('type') == 'integer' and val is not None:
                        val = int(val)
                    row_dict[cols[idx]] = val
                rows.append(row_dict)
            return rows

    def execute(self, sql, args=None):
        return self.query(sql, args)

db = TursoDB()

class EditorialAPIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Passkey')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            raw = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Route aliases
        if path == '/admin' or path == '/admin/':
            self.path = '/admin.html'
            return super().do_GET()

        # Static fonts alias: /fonts/... -> fonts/ or data/qamoos53/fonts/
        if path.startswith('/fonts/'):
            font_file = path[len('/fonts/'):]
            direct_target = os.path.join(BASE_DIR, 'fonts', font_file)
            if os.path.exists(direct_target):
                self.path = '/fonts/' + font_file
                return super().do_GET()
            target = os.path.join(BASE_DIR, 'data', 'qamoos53', 'fonts', font_file)
            if os.path.exists(target):
                self.path = '/data/qamoos53/fonts/' + font_file
                return super().do_GET()

        # API Routes
        if path == '/api/stats':
            return self.handle_get_stats()
        elif path == '/api/words':
            return self.handle_get_words(query)
        elif path.startswith('/api/words/'):
            word_id = path.split('/')[3]
            return self.handle_get_word(word_id)
        elif path == '/api/cloud/config':
            return self.handle_get_cloud_config()
        elif path == '/api/categories':
            return self.handle_get_categories()
        elif path == '/api/lexicon':
            return self.handle_get_lexicon()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path == '/api/auth/verify':
            passkey = body.get('passkey', '')
            if passkey == ADMIN_PASSKEY:
                return self.send_json({'success': True, 'message': 'Authorized'})
            else:
                return self.send_json({'success': False, 'error': 'Invalid passkey'}, status=401)

        elif path == '/api/words':
            return self.handle_create_word(body)
        elif path.startswith('/api/words/') and path.endswith('/apply-suggestion'):
            word_id = path.split('/')[3]
            return self.handle_apply_suggestion(word_id)
        elif path.startswith('/api/words/') and path.endswith('/approve'):
            word_id = path.split('/')[3]
            return self.handle_approve_word(word_id)
        elif path == '/api/sync/spellbank':
            return self.handle_sync_spellbank()
        elif path == '/api/diagnostics/run':
            return self.handle_run_diagnostics()

        self.send_json({'error': 'Not found'}, status=404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path.startswith('/api/words/'):
            word_id = path.split('/')[3]
            return self.handle_update_word(word_id, body)

        self.send_json({'error': 'Not found'}, status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/words/'):
            word_id = path.split('/')[3]
            return self.handle_delete_word(word_id)

        self.send_json({'error': 'Not found'}, status=404)

    # -------------------------------------------------------------
    # API Implementations (Direct Turso Cloud)
    # -------------------------------------------------------------

    def handle_get_stats(self):
        try:
            total_rows = db.query('SELECT COUNT(*) as c FROM words;')
            total = total_rows[0]['c'] if total_rows else 0

            status_rows = db.query("SELECT review_status, COUNT(*) as c FROM words GROUP BY review_status;")
            status_map = {r['review_status']: r['c'] for r in status_rows}

            level_rows = db.query("SELECT level, COUNT(*) as c FROM words GROUP BY level;")
            level_map = {r['level']: r['c'] for r in level_rows}

            audio_rows = db.query("SELECT COUNT(*) as c FROM words WHERE audio_url != '' AND audio_url IS NOT NULL;")
            with_audio = audio_rows[0]['c'] if audio_rows else 0

            image_rows = db.query("SELECT COUNT(*) as c FROM words WHERE image_url != '' AND image_url IS NOT NULL;")
            with_image = image_rows[0]['c'] if image_rows else 0

            self.send_json({
                'database': 'Turso (libSQL Cloud)',
                'turso_host': 'lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io',
                'total_words': total,
                'pending': status_map.get('pending', 0),
                'flagged': status_map.get('flagged', 0),
                'edited': status_map.get('edited', 0),
                'approved': status_map.get('approved', 0),
                'with_audio': with_audio,
                'with_image': with_image,
                'cloud_synced': total,
                'levels': level_map
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_get_categories(self):
        try:
            rows = db.query("SELECT name, word_count FROM categories ORDER BY word_count DESC;")
            cats = [{'name': r['name'], 'count': r['word_count']} for r in rows]
            self.send_json({'categories': cats})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_get_lexicon(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed.query)
            search = query_params.get('search', [''])[0].strip()
            origin = query_params.get('origin', ['all'])[0].strip()
            page = max(1, int(query_params.get('page', ['1'])[0]))
            limit = min(max(1, int(query_params.get('limit', ['100'])[0])), 500)
            offset = (page - 1) * limit

            conditions = []
            params = []

            if search:
                sp = f"%{search}%"
                conditions.append('(w.word_name LIKE ? OR w.original_word_name LIKE ? OR w.transliteration LIKE ? OR w.english_meaning LIKE ? OR w.french_meaning LIKE ? OR w.sentence LIKE ?)')
                params.extend([sp, sp, sp, sp, sp, sp])

            if origin == 'alerts':
                conditions.append("""(
                    (w.orthography_flags IS NOT NULL AND w.orthography_flags != '' AND w.orthography_flags != '[]')
                    OR (w.original_word_name IS NOT NULL AND w.original_word_name != '' AND w.original_word_name != w.word_name)
                    OR (w.curator_notes IS NOT NULL AND w.curator_notes != '')
                )""")
            elif origin == 'Arabic':
                conditions.append("w.id IN (SELECT word_id FROM word_categories WHERE category_name LIKE '%Arabic%')")
            elif origin == 'Persian':
                conditions.append("w.id IN (SELECT word_id FROM word_categories WHERE category_name LIKE '%Persian%' OR category_name LIKE '%Urdu%')")
            elif origin == 'Gujarati':
                conditions.append("w.id IN (SELECT word_id FROM word_categories WHERE category_name LIKE '%Gujarati%')")
            elif origin == 'Compound':
                conditions.append("w.id IN (SELECT word_id FROM word_categories WHERE category_name LIKE '%Compound%')")

            where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

            count_sql = f"SELECT COUNT(*) as c FROM words w {where_clause};"
            total_db_sql = "SELECT COUNT(*) as c FROM words;"
            select_sql = f"""
                SELECT 
                    w.id, w.word_name, w.original_word_name, w.transliteration, w.level,
                    w.english_meaning, w.french_meaning, w.sentence, w.singular, w.plural,
                    w.alphabet, w.audio_url, w.image_url, w.review_status,
                    w.suggested_spelling, w.orthography_flags, w.curator_notes,
                    (SELECT GROUP_CONCAT(category_name, ', ') FROM word_categories WHERE word_id = w.id) as categories_list
                FROM words w
                {where_clause}
                ORDER BY 
                    CASE 
                        WHEN w.review_status = 'approved' THEN 1 
                        WHEN w.review_status = 'edited' THEN 2 
                        WHEN w.review_status = 'flagged' THEN 3 
                        ELSE 4 
                    END ASC, 
                    w.id ASC
                LIMIT ? OFFSET ?;
            """

            count_rows = db.query(count_sql, params)
            total_matching = count_rows[0].get('c', 0) if count_rows else 0

            total_db_rows = db.query(total_db_sql)
            total_db_words = total_db_rows[0].get('c', 8587) if total_db_rows else 8587

            select_params = list(params) + [limit, offset]
            rows = db.query(select_sql, select_params)

            words = []
            for r in rows:
                flags = []
                if r.get('orthography_flags'):
                    try:
                        flags = json.loads(r['orthography_flags'])
                    except Exception:
                        pass

                misspellings = []
                if r.get('original_word_name') and r['original_word_name'] != r['word_name']:
                    misspellings.append(r['original_word_name'])
                
                cats = r['categories_list'].split(', ') if r.get('categories_list') else []
                origin_cat = 'Arabic'
                if any('gujarati' in c.lower() for c in cats):
                    origin_cat = 'Gujarati'
                elif any('persian' in c.lower() or 'urdu' in c.lower() for c in cats):
                    origin_cat = 'Persian'

                alert_label = flags[0].get('label', 'Orthographic Alert') if flags else 'Orthographic Alert'
                alert_rule = ' '.join(f.get('message', '') for f in flags) if flags else ''
                if not alert_rule and misspellings:
                    alert_rule = f"Standardized from legacy orthography ({', '.join(misspellings)})."
                if r.get('curator_notes'):
                    alert_rule = f"{alert_rule} · {r['curator_notes']}" if alert_rule else r['curator_notes']

                has_alert = bool(flags or misspellings or r.get('curator_notes'))

                words.append({
                    'id': f"qamoos-{r['id']}",
                    'tursoId': r['id'],
                    'arabic': r['word_name'],
                    'transliteration': r['transliteration'] or '',
                    'gujaratiPhonetic': r['singular'] if r.get('singular') and r['singular'] != '-' else '',
                    'origin': origin_cat,
                    'rootLetters': '',
                    'partOfSpeech': r['level'].capitalize() if r.get('level') else 'Noun',
                    'definition': r['english_meaning'] or r.get('french_meaning') or 'Term recorded in Lisan al-Dawat lexicon.',
                    'notes': r.get('curator_notes') or (f"Plural: {r['plural']}" if r.get('plural') and r['plural'] != '-' else ''),
                    'audioUrl': r['audio_url'] or '',
                    'reviewStatus': r['review_status'],
                    'spellingGuide': {
                        'label': alert_label,
                        'commonMisspellings': misspellings,
                        'rule': alert_rule or 'Standardized modern Lisan al-Dawat orthography.'
                    } if has_alert else None,
                    'sentenceReference': {
                        'arabic': r['sentence'] or '',
                        'translation': r.get('french_meaning') or '',
                        'gloss': 'Authentic contextual citation from Qamoos53 archive.' if r.get('sentence') else ''
                    },
                    'paragraphReference': {
                        'arabic': '',
                        'translation': '',
                        'contextType': 'Lisan al-Dawat'
                    }
                })

            self.send_json({
                'total': total_matching,
                'totalDbWords': total_db_words,
                'page': page,
                'limit': limit,
                'hasMore': (offset + len(words)) < total_matching,
                'words': words
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_get_words(self, query):
        try:
            page = int(query.get('page', ['1'])[0])
            limit = int(query.get('limit', ['50'])[0])
            offset = (page - 1) * limit

            status = query.get('status', ['all'])[0]
            search = query.get('search', [''])[0].strip()
            alphabet = query.get('alphabet', [''])[0].strip()
            category = query.get('category', [''])[0].strip()
            level = query.get('level', [''])[0].strip()

            conditions = []
            params = []

            if status != 'all' and status:
                conditions.append("w.review_status = ?")
                params.append(status)

            if search:
                search_param = f"%{search}%"
                conditions.append("(w.word_name LIKE ? OR w.transliteration LIKE ? OR w.english_meaning LIKE ? OR w.word_terms LIKE ?)")
                params.extend([search_param, search_param, search_param, search_param])

            if alphabet:
                conditions.append("w.alphabet = ?")
                params.append(alphabet)

            if level:
                conditions.append("w.level = ?")
                params.append(level)

            if category:
                conditions.append("w.id IN (SELECT word_id FROM word_categories WHERE category_name = ?)")
                params.append(category)

            where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            # Count total
            count_res = db.query(f"SELECT COUNT(*) as c FROM words w {where_clause};", params)
            total_count = count_res[0]['c'] if count_res else 0

            # Fetch rows
            sql = f"""
                SELECT 
                    w.id, w.word_name, w.original_word_name, w.transliteration, w.level,
                    w.english_meaning, w.french_meaning, w.sentence, w.singular, w.plural,
                    w.alphabet, w.audio_url, w.image_url, w.review_status,
                    w.suggested_spelling, w.orthography_flags, w.curator_notes, w.updated_at,
                    (SELECT GROUP_CONCAT(category_name, ', ') FROM word_categories WHERE word_id = w.id) as categories_list
                FROM words w
                {where_clause}
                ORDER BY w.id ASC
                LIMIT ? OFFSET ?;
            """
            rows = db.query(sql, params + [limit, offset])

            words = []
            for r in rows:
                flags = []
                if r.get('orthography_flags'):
                    try:
                        flags = json.loads(r['orthography_flags'])
                    except Exception:
                        pass

                words.append({
                    'id': r['id'],
                    'word_name': r['word_name'],
                    'original_word_name': r['original_word_name'] or r['word_name'],
                    'transliteration': r['transliteration'],
                    'level': r['level'],
                    'english_meaning': r['english_meaning'],
                    'french_meaning': r['french_meaning'],
                    'sentence': r['sentence'],
                    'singular': r['singular'],
                    'plural': r['plural'],
                    'alphabet': r['alphabet'],
                    'audio_url': r['audio_url'],
                    'image_url': r['image_url'],
                    'review_status': r['review_status'] or 'pending',
                    'suggested_spelling': r['suggested_spelling'],
                    'orthography_flags': flags,
                    'curator_notes': r['curator_notes'],
                    'updated_at': r['updated_at'],
                    'categories': r['categories_list'].split(', ') if r.get('categories_list') else []
                })

            self.send_json({
                'page': page,
                'limit': limit,
                'total': total_count,
                'total_pages': (total_count + limit - 1) // limit if limit > 0 else 1,
                'words': words
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_get_word(self, word_id):
        try:
            rows = db.query("SELECT * FROM words WHERE id = ?;", [int(word_id)])
            if not rows:
                return self.send_json({'error': 'Word not found'}, status=404)
            row = rows[0]

            # Fetch meanings
            m_rows = db.query("SELECT meaning FROM word_meanings WHERE word_id = ?;", [int(word_id)])
            meanings = [m['meaning'] for m in m_rows]

            # Fetch translations
            t_rows = db.query("SELECT locale, translated_text FROM word_translations WHERE word_id = ?;", [int(word_id)])
            trans = {t['locale']: t['translated_text'] for t in t_rows}

            # Fetch categories
            c_rows = db.query("SELECT category_name FROM word_categories WHERE word_id = ?;", [int(word_id)])
            categories = [c['category_name'] for c in c_rows]

            flags = []
            if row.get('orthography_flags'):
                try:
                    flags = json.loads(row['orthography_flags'])
                except Exception:
                    pass

            word_data = {
                'id': row['id'],
                'word_name': row['word_name'],
                'original_word_name': row['original_word_name'] or row['word_name'],
                'transliteration': row['transliteration'],
                'level': row['level'],
                'english_meaning': row['english_meaning'],
                'french_meaning': row['french_meaning'],
                'sentence': row['sentence'],
                'singular': row['singular'],
                'plural': row['plural'],
                'alphabet': row['alphabet'],
                'word_terms': row['word_terms'],
                'sequence': row['sequence'],
                'is_active': bool(row.get('is_active', 1)),
                'image_url': row['image_url'],
                'image_name': row['image_name'],
                'audio_url': row['audio_url'],
                'audio_name': row['audio_name'],
                'review_status': row['review_status'] or 'pending',
                'suggested_spelling': row['suggested_spelling'],
                'orthography_flags': flags,
                'curator_notes': row['curator_notes'] or '',
                'updated_at': row['updated_at'],
                'cloud_synced_at': row['cloud_synced_at'],
                'meanings': meanings,
                'translations': trans,
                'categories': categories
            }

            self.send_json(word_data)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_update_word(self, word_id, body):
        try:
            wid = int(word_id)
            existing = db.query("SELECT id, word_name, original_word_name FROM words WHERE id = ?;", [wid])
            if not existing:
                return self.send_json({'error': 'Word not found'}, status=404)

            now = datetime.utcnow().isoformat() + 'Z'
            word_name = body.get('word_name', existing[0]['word_name']).strip()
            transliteration = body.get('transliteration', '').strip()
            level = body.get('level', 'intermediate')
            english_meaning = body.get('english_meaning', '').strip()
            french_meaning = body.get('french_meaning', '').strip()
            sentence = body.get('sentence', '').strip()
            singular = body.get('singular', '').strip()
            plural = body.get('plural', '').strip()
            review_status = body.get('review_status', 'edited')
            curator_notes = body.get('curator_notes', '').strip()

            orthography_flags = None
            if 'orthography_rule' in body:
                rule_text = (body.get('orthography_rule') or '').strip()
                if rule_text:
                    orthography_flags = json.dumps([{
                        'code': 'orthographic_alert',
                        'severity': 'high',
                        'label': 'Orthographic Alert',
                        'message': rule_text
                    }])
                else:
                    orthography_flags = '[]'

            db.execute("""
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
                    orthography_flags = COALESCE(?, orthography_flags),
                    updated_at = ?
                WHERE id = ?;
            """, [
                word_name, transliteration, level, english_meaning, french_meaning,
                sentence, singular, plural, review_status, curator_notes, orthography_flags, now, wid
            ])

            # Update categories if passed
            if 'categories' in body and isinstance(body['categories'], list):
                db.execute("DELETE FROM word_categories WHERE word_id = ?;", [wid])
                for cat in body['categories']:
                    if cat.strip():
                        db.execute("INSERT OR IGNORE INTO word_categories (word_id, category_name) VALUES (?, ?);", [wid, cat.strip()])

            # Update meanings if passed
            if 'meanings' in body and isinstance(body['meanings'], list):
                db.execute("DELETE FROM word_meanings WHERE word_id = ?;", [wid])
                for m in body['meanings']:
                    if m.strip():
                        db.execute("INSERT INTO word_meanings (word_id, meaning) VALUES (?, ?);", [wid, m.strip()])

            return self.handle_get_word(wid)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_apply_suggestion(self, word_id):
        try:
            wid = int(word_id)
            rows = db.query("SELECT suggested_spelling, word_name, original_word_name FROM words WHERE id = ?;", [wid])
            if not rows or not rows[0]['suggested_spelling']:
                return self.send_json({'error': 'No suggestion available'}, status=400)

            now = datetime.utcnow().isoformat() + 'Z'
            orig = rows[0].get('original_word_name') or rows[0]['word_name']
            db.execute("""
                UPDATE words 
                SET word_name = suggested_spelling, 
                    original_word_name = ?,
                    review_status = 'edited',
                    updated_at = ?
                WHERE id = ?;
            """, [orig, now, wid])

            return self.handle_get_word(wid)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_approve_word(self, word_id):
        try:
            wid = int(word_id)
            now = datetime.utcnow().isoformat() + 'Z'
            db.execute("""
                UPDATE words 
                SET review_status = 'approved',
                    updated_at = ?
                WHERE id = ?;
            """, [now, wid])
            return self.handle_get_word(wid)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_create_word(self, body):
        try:
            res = db.query("SELECT MAX(id) as max_id FROM words;")
            max_id = res[0]['max_id'] if res and res[0]['max_id'] else 0
            new_id = max_id + 1

            word_name = body.get('word_name', '').strip()
            translit = body.get('transliteration', '').strip()
            level = body.get('level', 'intermediate')
            english = body.get('english_meaning', '').strip()
            french = body.get('french_meaning', '').strip()
            sentence = body.get('sentence', '').strip()
            alphabet = body.get('alphabet', word_name[0] if word_name else '')
            now = datetime.utcnow().isoformat() + 'Z'

            db.execute("""
                INSERT INTO words (
                    id, word_name, original_word_name, transliteration, level,
                    english_meaning, french_meaning, sentence, alphabet,
                    review_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'edited', ?);
            """, [new_id, word_name, word_name, translit, level, english, french, sentence, alphabet, now])

            return self.handle_get_word(new_id)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_delete_word(self, word_id):
        try:
            wid = int(word_id)
            db.execute("DELETE FROM words WHERE id = ?;", [wid])
            db.execute("DELETE FROM word_meanings WHERE word_id = ?;", [wid])
            db.execute("DELETE FROM word_translations WHERE word_id = ?;", [wid])
            db.execute("DELETE FROM word_categories WHERE word_id = ?;", [wid])
            self.send_json({'success': True, 'deleted_id': wid})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_run_diagnostics(self):
        # Runs diagnostics update directly in Turso
        from cloud.setup_turso import turso_execute
        res = db.query("SELECT id, word_name, transliteration FROM words;")
        from data.qamoos53.diagnostics import analyze_word
        
        updated = 0
        for r in res:
            flags, suggested = analyze_word(r['word_name'], r['transliteration'])
            if flags:
                db.execute("""
                    UPDATE words 
                    SET orthography_flags = ?,
                        suggested_spelling = ?,
                        review_status = CASE WHEN review_status = 'approved' THEN 'approved'
                                             WHEN review_status = 'edited' THEN 'edited'
                                             ELSE 'flagged' END
                    WHERE id = ?;
                """, [json.dumps(flags, ensure_ascii=False), suggested if suggested != r['word_name'] else None, r['id']])
                updated += 1

        self.send_json({'success': True, 'flagged_count': updated})

    def handle_sync_spellbank(self):
        """
        Pulls approved & edited words directly from Turso, updates data/lexicon.json and data/seed.js,
        and runs build.py to update js/app.bundle.js!
        """
        try:
            rows = db.query("""
                SELECT 
                    w.id, w.word_name, w.transliteration, w.level, w.english_meaning,
                    w.sentence, w.singular, w.plural, w.audio_url,
                    (SELECT GROUP_CONCAT(meaning, '; ') FROM word_meanings WHERE word_id = w.id) as lisan_meaning
                FROM words w
                WHERE w.review_status IN ('approved', 'edited')
                ORDER BY w.id ASC;
            """)

            lexicon_entries = []
            for r in rows:
                slug = r['transliteration'].lower().replace(' ', '-').replace("'", "")
                if not slug:
                    slug = f"word-{r['id']}"

                lexicon_entries.append({
                    "id": slug,
                    "qamoosId": r['id'],
                    "arabic": r['word_name'],
                    "arabicNormalized": r['word_name'].replace('َ', '').replace('ِ', '').replace('ُ', '').replace('ْ', '').replace('ّ', ''),
                    "transliteration": r['transliteration'],
                    "gujaratiPhonetic": "",
                    "origin": "Lisan al-Dawat",
                    "partOfSpeech": "Noun",
                    "definition": r['english_meaning'] or (r['lisan_meaning'] if r.get('lisan_meaning') else ""),
                    "audioUrl": r['audio_url'] or "",
                    "notes": f"Turso curated entry from Qamoos53 (ID: {r['id']}).",
                    "sentenceReference": {
                        "arabic": r['sentence'] or "",
                        "translation": ""
                    }
                })

            lexicon_path = os.path.join(BASE_DIR, 'data', 'lexicon.json')
            existing = []
            if os.path.exists(lexicon_path):
                try:
                    with open(lexicon_path, 'r', encoding='utf-8') as f:
                        existing = json.load(f)
                except Exception:
                    existing = []

            existing_ids = {e['id'] for e in existing}
            merged = list(existing)
            new_count = 0
            for entry in lexicon_entries:
                if entry['id'] in existing_ids:
                    idx = next(i for i, e in enumerate(merged) if e['id'] == entry['id'])
                    merged[idx] = entry
                else:
                    merged.append(entry)
                    new_count += 1

            with open(lexicon_path, 'w', encoding='utf-8') as f:
                json.dump(merged, f, ensure_ascii=False, indent=2)

            # Update data/seed.js
            seed_path = os.path.join(BASE_DIR, 'data', 'seed.js')
            seed_code = f"export const SEED_LEXICON = {json.dumps(merged, ensure_ascii=False, indent=2)};\n"
            with open(seed_path, 'w', encoding='utf-8') as f:
                f.write(seed_code)

            # Run build.py
            build_path = os.path.join(BASE_DIR, 'build.py')
            build_res = subprocess.run([sys.executable, build_path], capture_output=True, text=True, cwd=BASE_DIR)

            self.send_json({
                'success': True,
                'source': 'Turso Cloud Database',
                'approved_synced': len(lexicon_entries),
                'total_in_lexicon': len(merged),
                'new_added': new_count,
                'bundle_build': build_res.stdout.strip()
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_get_cloud_config(self):
        self.send_json({
            'provider': 'turso',
            'turso': {
                'url': 'libsql://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io',
                'connected': True,
                'host': 'aws-ap-south-1'
            }
        })

def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), EditorialAPIHandler) as httpd:
        print(f"✦ Lisan al-Dawat Editorial Studio running at: http://localhost:{PORT}/admin")
        print(f"✦ Active Database: Turso (libsql://lsd-spell-bank-shabbirmaanak.aws-ap-south-1.turso.io)")
        print(f"✦ Admin Passkey: {ADMIN_PASSKEY}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == '__main__':
    run()
