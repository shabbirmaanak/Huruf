-- Supabase PostgreSQL Schema for Qamoos53 Editorial Collaborative Cloud Database

CREATE TABLE IF NOT EXISTS qamoos_words (
    id BIGINT PRIMARY KEY,
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
    audio_url TEXT,
    image_url TEXT,
    review_status TEXT DEFAULT 'pending',
    suggested_spelling TEXT,
    curator_notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast multi-script search
CREATE INDEX IF NOT EXISTS idx_qamoos_word_name ON qamoos_words USING gin (to_tsvector('simple', word_name));
CREATE INDEX IF NOT EXISTS idx_qamoos_translit ON qamoos_words USING gin (to_tsvector('english', transliteration));
CREATE INDEX IF NOT EXISTS idx_qamoos_status ON qamoos_words (review_status);
CREATE INDEX IF NOT EXISTS idx_qamoos_alphabet ON qamoos_words (alphabet);

-- Row Level Security (RLS)
ALTER TABLE qamoos_words ENABLE ROW LEVEL SECURITY;

-- Allow public read access to approved words
CREATE POLICY "Public can read approved words"
ON qamoos_words FOR SELECT
USING (true);

-- Allow authenticated editors to insert/update words
CREATE POLICY "Editors can modify words"
ON qamoos_words FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
