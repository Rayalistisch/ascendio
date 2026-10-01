-- Migration v26: optioneel volledig eigen IBVision-URL-pad per topic/artikel.
-- Wanneer gezet, overschrijft dit de automatische prefix+slug-opbouw volledig,
-- zodat je een pagina op een exact pad kunt publiceren (bijv. "/diensten/seo").
-- Leeg/NULL laten = ongewijzigd gedrag (prefix + geslugificeerde titel).

ALTER TABLE asc_cluster_topics ADD COLUMN IF NOT EXISTS ibvision_url text;
