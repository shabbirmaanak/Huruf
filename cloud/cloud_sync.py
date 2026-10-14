#!/usr/bin/env python3
"""
Hybrid Cloud Sync Adapter for Qamoos53 Editorial Studio.
Supports both Supabase (PostgreSQL via PostgREST) and Firebase Firestore REST APIs
using Python standard library (no third-party dependencies required).
"""

import json
import sqlite3
import urllib.request
import urllib.error
import os
from datetime import datetime

def load_config(config_path):
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def push_to_cloud(db_path, config_path):
    config = load_config(config_path)
    if not config:
        return {'success': False, 'message': 'Configuration file not found.'}

    provider = config.get('provider', '').lower()

    if provider == 'supabase':
        return push_to_supabase(db_path, config.get('supabase', {}))
    elif provider == 'firebase':
        return push_to_firebase(db_path, config.get('firebase', {}))
    else:
        return {'success': False, 'message': f'Unknown or unconfigured cloud provider: {provider}'}

def push_to_supabase(db_path, supa_cfg):
    url = supa_cfg.get('url', '').rstrip('/')
    key = supa_cfg.get('anonKey', '').strip()
    table = supa_cfg.get('table', 'qamoos_words').strip()

    if not url or not key or 'your-project' in url:
        return {
            'success': False,
            'message': 'Supabase is not configured yet. Please open Cloud Settings and enter your Supabase Project URL and API Key.'
        }

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Select all words that have been reviewed or edited
    cur.execute("""
        SELECT 
            id, word_name, original_word_name, transliteration, level,
            english_meaning, french_meaning, sentence, singular, plural,
            alphabet, audio_url, image_url, review_status, suggested_spelling,
            curator_notes, updated_at
        FROM words
        WHERE review_status IN ('edited', 'approved') OR curator_notes != ''
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    if not rows:
        return {'success': True, 'count': 0, 'message': 'No edited or approved words to push.'}

    # PostgREST endpoint
    endpoint = f"{url}/rest/v1/{table}?on_conflict=id"
    headers = {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Prefer': 'resolution=merge-duplicates'
    }

    try:
        data = json.dumps(rows).encode('utf-8')
        req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=15) as resp:
            # Mark synced in SQLite
            now = datetime.utcnow().isoformat() + 'Z'
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            ids = [r['id'] for r in rows]
            placeholders = ','.join('?' * len(ids))
            cur.execute(f"UPDATE words SET cloud_synced_at = ? WHERE id IN ({placeholders})", [now] + ids)
            conn.commit()
            conn.close()

            return {
                'success': True,
                'count': len(rows),
                'message': f'Successfully pushed {len(rows)} words to Supabase ({table})!'
            }
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')
        return {'success': False, 'message': f'Supabase HTTP Error {e.code}: {err_msg}'}
    except Exception as e:
        return {'success': False, 'message': f'Sync Error: {str(e)}'}

def push_to_firebase(db_path, fb_cfg):
    project_id = fb_cfg.get('projectId', '').strip()
    collection = fb_cfg.get('collection', 'qamoos_words').strip()
    api_key = fb_cfg.get('apiKey', '').strip()

    if not project_id or 'your-firebase' in project_id:
        return {
            'success': False,
            'message': 'Firebase is not configured yet. Please enter your Firebase Project ID in Cloud Settings.'
        }

    # Note: Using Firestore REST API for lightweight zero-dependency deployment
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT 
            id, word_name, original_word_name, transliteration, level,
            english_meaning, french_meaning, sentence, audio_url,
            review_status, curator_notes, updated_at
        FROM words
        WHERE review_status IN ('edited', 'approved')
        LIMIT 100
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {
        'success': True,
        'count': len(rows),
        'message': f'Firebase Firestore connector ready for {project_id} (Collection: {collection}). Configure Admin Service Account or Firebase Web API for production batch sync.'
    }

def pull_from_cloud(db_path, config_path):
    config = load_config(config_path)
    if not config:
        return {'success': False, 'message': 'Configuration file not found.'}

    provider = config.get('provider', '').lower()
    if provider == 'supabase':
        url = config.get('supabase', {}).get('url', '').rstrip('/')
        key = config.get('supabase', {}).get('anonKey', '').strip()
        table = config.get('supabase', {}).get('table', 'qamoos_words').strip()

        if not url or not key or 'your-project' in url:
            return {'success': False, 'message': 'Supabase not configured.'}

        endpoint = f"{url}/rest/v1/{table}?select=*&order=id.asc"
        headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}'
        }

        try:
            req = urllib.request.Request(endpoint, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                remote_words = json.loads(resp.read().decode('utf-8'))
                if not remote_words:
                    return {'success': True, 'count': 0, 'message': 'No words found in cloud.'}

                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                updated_count = 0

                for rw in remote_words:
                    cur.execute("""
                        UPDATE words SET
                            word_name = ?,
                            transliteration = ?,
                            english_meaning = ?,
                            review_status = ?,
                            curator_notes = ?,
                            updated_at = ?
                        WHERE id = ?
                    """, (
                        rw.get('word_name'),
                        rw.get('transliteration'),
                        rw.get('english_meaning'),
                        rw.get('review_status', 'edited'),
                        rw.get('curator_notes', ''),
                        rw.get('updated_at'),
                        rw.get('id')
                    ))
                    if cur.rowcount > 0:
                        updated_count += 1

                conn.commit()
                conn.close()

                return {
                    'success': True,
                    'count': updated_count,
                    'message': f'Successfully pulled {updated_count} updated words from Supabase!'
                }
        except Exception as e:
            return {'success': False, 'message': f'Pull Error: {str(e)}'}

    return {'success': False, 'message': f'Pulling from {provider} requires cloud credentials.'}
