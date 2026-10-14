#!/usr/bin/env python3
"""
Lisan al-Dawat Orthography Diagnostic & Pre-Correction Engine
Analyzes all 8,587 words in qamoos53.sqlite and flags archaic orthography,
providing actionable suggestions and category labels.
"""

import sqlite3
import json
import re

DB_PATH = '/Users/shabbirmaanak/Documents/Spell Bank/data/qamoos53/qamoos53.sqlite'

def analyze_word(word_name, transliteration):
    flags = []
    suggested = word_name

    # 1. Archaic Alif + Sukun (اْ -> آ or ا)
    if 'اْ' in word_name:
        flags.append({
            'code': 'ARCHAIC_ALIF_SUKUN',
            'severity': 'high',
            'label': 'Legacy Alif-Sukun (اْ)',
            'message': 'Legacy font artifact: Alif with Sukun (اْ) was used to force initial long "Aa". Typically written as Alif-Madd (آ).'
        })
        # If it starts with اْ followed by a consonant or vowel
        if word_name.startswith('اْ'):
            suggested = 'آ' + word_name[2:]
        else:
            suggested = suggested.replace('اْ', 'آ')

    # 2. Ta Marbutah check
    if 'ة' in word_name or 'ۃ' in word_name:
        # Check if it is a single word ending in Ta Marbutah (like بركة -> بركت)
        flags.append({
            'code': 'TA_MARBUTAH',
            'severity': 'medium',
            'label': 'Ta Marbutah (ة)',
            'message': 'Contains Ta Marbutah (ة). Common Lisan al-Dawat loanwords use long Ta (ت) unless in sacred Arabic phrases.'
        })
        # If ends with ة, propose ت
        if suggested.endswith('ة') or suggested.endswith('ۃ'):
            suggested = suggested[:-1] + 'ت'

    # 3. Spaces before punctuation or semicolons
    if re.search(r'\s+[؛،,.:]', word_name):
        flags.append({
            'code': 'PUNCTUATION_SPACING',
            'severity': 'low',
            'label': 'Punctuation Spacing',
            'message': 'Extraneous whitespace before punctuation.'
        })
        suggested = re.sub(r'\s+([؛،,.:])', r'\1', suggested)

    # 4. Duplicate spaces
    if '  ' in word_name:
        flags.append({
            'code': 'DOUBLE_SPACE',
            'severity': 'low',
            'label': 'Double Space',
            'message': 'Multiple contiguous spaces in headword.'
        })
        suggested = re.sub(r'\s+', ' ', suggested)

    # 5. Honorific abbreviations in headword (ع م, ص ع, الخ)
    if re.search(r'\b(ع م|ص ع|صلعم|رض|نه|ط ع)\b', word_name):
        flags.append({
            'code': 'HONORIFIC_SUFFIX',
            'severity': 'low',
            'label': 'Honorific Abbreviation',
            'message': 'Headword contains inline honorific shorthand (e.g. ع م). Consider standardizing or keeping in metadata.'
        })

    return flags, suggested.strip()

def run_diagnostics():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute('SELECT id, word_name, transliteration FROM words')
    rows = cur.fetchall()

    flagged_count = 0
    alif_count = 0
    ta_count = 0

    for word_id, word_name, translit in rows:
        flags, suggested = analyze_word(word_name, translit)
        
        status = 'pending'
        if len(flags) > 0:
            flagged_count += 1
            status = 'flagged'
            for f in flags:
                if f['code'] == 'ARCHAIC_ALIF_SUKUN': alif_count += 1
                if f['code'] == 'TA_MARBUTAH': ta_count += 1

        cur.execute('''
            UPDATE words 
            SET orthography_flags = ?,
                suggested_spelling = ?,
                review_status = CASE WHEN review_status = 'approved' THEN 'approved' 
                                     WHEN review_status = 'edited' THEN 'edited'
                                     ELSE ? END
            WHERE id = ?
        ''', (json.dumps(flags, ensure_ascii=False), suggested if suggested != word_name else None, status, word_id))

    conn.commit()
    conn.close()

    print(f"Diagnostics complete:")
    print(f"- Total words analyzed: {len(rows)}")
    print(f"- Flagged for review: {flagged_count}")
    print(f"- Archaic Alif-Sukun (اْ): {alif_count}")
    print(f"- Ta Marbutah (ة): {ta_count}")

if __name__ == '__main__':
    run_diagnostics()
