-- ============================================================
-- Migration v22: Interne-link-voorstellen
-- Na cluster-analyse kan de AI interne links voorstellen tussen bestaande
-- pagina's. Voorstellen worden hier opgeslagen (WordPress blijft ongemoeid tot
-- de gebruiker publiceert) zodat je ze eerst kunt controleren.
-- ============================================================

CREATE TABLE IF NOT EXISTS asc_interlink_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL REFERENCES asc_sites(id) ON DELETE CASCADE,
  cluster_id    uuid REFERENCES asc_clusters(id) ON DELETE CASCADE,
  wp_post_id    integer NOT NULL,
  url           text,
  title         text,
  proposed_html text,
  added_links   jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{url, anchor, title}]
  status        text NOT NULL DEFAULT 'generating', -- 'generating' | 'pending' | 'applied' | 'dismissed' | 'failed'
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cluster_id, wp_post_id)
);

CREATE INDEX IF NOT EXISTS idx_asc_interlink_cluster ON asc_interlink_proposals(cluster_id);
ALTER TABLE asc_interlink_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own interlink proposals"
  ON asc_interlink_proposals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
