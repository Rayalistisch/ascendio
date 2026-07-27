-- ============================================================
-- Migration v16: Programmatic SEO
-- Dataset + {{variabelen}} patroon -> bulk pagina's, gegenereerd
-- door de bestaande worker (met uniqueness-guard verplicht aan).
--
-- Hergebruikt asc_clusters/asc_cluster_topics i.p.v. een nieuw
-- model: de worker, fan-out route en runs-historie werken al op
-- dit model. Een `mode`-vlag is de kleinste ingreep.
-- ============================================================

-- 1. Datasets: geuploade of geplakte tabeldata per site
CREATE TABLE IF NOT EXISTS asc_datasets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id    uuid NOT NULL REFERENCES asc_sites(id) ON DELETE CASCADE,
  name       text NOT NULL,
  columns    jsonb NOT NULL DEFAULT '[]'::jsonb, -- string[]: kolomnamen
  row_count  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asc_datasets_site ON asc_datasets(site_id);
ALTER TABLE asc_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own datasets"
  ON asc_datasets FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Dataset-rijen: één rij = één toekomstige pagina
CREATE TABLE IF NOT EXISTS asc_dataset_rows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES asc_datasets(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb, -- {kolom: waarde}
  row_index  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asc_dataset_rows_dataset ON asc_dataset_rows(dataset_id);
ALTER TABLE asc_dataset_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own dataset rows"
  ON asc_dataset_rows FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. asc_clusters uitbreiden met programmatic modus
ALTER TABLE asc_clusters
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'editorial', -- 'editorial' | 'programmatic'
  ADD COLUMN IF NOT EXISTS dataset_id uuid REFERENCES asc_datasets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title_pattern text,
  ADD COLUMN IF NOT EXISTS slug_pattern text,
  ADD COLUMN IF NOT EXISTS topic_pattern text;

-- Backfill: alle bestaande clusters zijn editorial
UPDATE asc_clusters SET mode = 'editorial' WHERE mode IS NULL;

-- 4. asc_cluster_topics koppelen aan een dataset-rij
ALTER TABLE asc_cluster_topics
  ADD COLUMN IF NOT EXISTS dataset_row_id uuid REFERENCES asc_dataset_rows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_vars jsonb, -- gesubstitueerde variabelen, voor debug/herhaalbaarheid
  ADD COLUMN IF NOT EXISTS slug text;           -- gewenste slug uit slug_pattern

-- Voorkom dubbele topics voor dezelfde dataset-rij binnen een cluster.
-- Geen partiële index: Postgres behandelt NULL als distinct, dus editorial
-- topics (dataset_row_id = NULL) mogen met meerdere naast elkaar bestaan.
-- Een volledige unique index laat ON CONFLICT-inference (upsert) wél werken.
CREATE UNIQUE INDEX IF NOT EXISTS uq_asc_cluster_topics_row
  ON asc_cluster_topics(cluster_id, dataset_row_id);
