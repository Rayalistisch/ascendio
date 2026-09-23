-- Migration v24: Shopify platform support
-- Adds Shopify-specific credential columns. Shopify is a third `platform`
-- value alongside 'wordpress' (default) and 'ibvision'. Existing sites are
-- unaffected — platform keeps its 'wordpress' default and the wp_* columns
-- are already nullable since v12.

ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS shopify_shop_domain text;
ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS shopify_access_token_encrypted text;

-- Optional: which blog new articles are published to. When NULL the worker
-- resolves the store's first blog automatically.
ALTER TABLE asc_sites ADD COLUMN IF NOT EXISTS shopify_blog_id bigint;
