-- ═══════════════════════════════════════════════════════
-- Fix: wave_counts missing columns
-- ═══════════════════════════════════════════════════════
-- backend/services/elliott_wave.js returns these fields from
-- runWaveAnalysis(), and backend/pipeline/stage4_wavecount.js
-- upserts them into wave_counts. Without these columns the
-- upsert fails with "column does not exist" and wave_counts
-- stays empty for every ticker in the pipeline.

ALTER TABLE wave_counts ADD COLUMN IF NOT EXISTS wave_pattern           TEXT;
ALTER TABLE wave_counts ADD COLUMN IF NOT EXISTS wave4_type             TEXT;
ALTER TABLE wave_counts ADD COLUMN IF NOT EXISTS wave1_origin           NUMERIC;
ALTER TABLE wave_counts ADD COLUMN IF NOT EXISTS correction_type        TEXT;
ALTER TABLE wave_counts ADD COLUMN IF NOT EXISTS capitulation_detected  BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_wave_pattern            ON wave_counts(wave_pattern)           WHERE wave_pattern IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wave_capitulation       ON wave_counts(capitulation_detected)  WHERE capitulation_detected = TRUE;
