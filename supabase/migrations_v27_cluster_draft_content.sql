-- Migration v27: concept-first clusters.
-- De generatie-worker bewaart de gegenereerde content voortaan op het topic
-- (status 'draft') zodat de gebruiker die kan nalezen/bewerken en daarna bewust
-- publiceert — i.p.v. direct publiceren. Leeg/NULL = nog niets gegenereerd.

ALTER TABLE asc_cluster_topics ADD COLUMN IF NOT EXISTS generated_content text;
ALTER TABLE asc_cluster_topics ADD COLUMN IF NOT EXISTS generated_title text;
ALTER TABLE asc_cluster_topics ADD COLUMN IF NOT EXISTS generated_meta text;
ALTER TABLE asc_cluster_topics ADD COLUMN IF NOT EXISTS generated_at timestamptz;
