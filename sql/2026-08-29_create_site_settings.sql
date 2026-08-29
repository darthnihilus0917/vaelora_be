-- Sitewide settings (currently just the storefront hero image) feature.
-- Run this in the Supabase SQL editor (or `supabase db execute` / psql)
-- against the project's Postgres database. This repo has no local schema/
-- migrations tracking, so this file is the manual record of the change.
--
-- Singleton table: exactly one row (id = 1), enforced by the CHECK
-- constraint on the primary key rather than a separate config concept.

CREATE TABLE IF NOT EXISTS site_settings (
  id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_image_url          TEXT,          -- public URL the app serves (R2_PUBLIC_URL + storage key)
  hero_image_storage_key  TEXT,          -- R2 object key, e.g. site/hero/<uuid>.jpg
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Every other public-facing table in this project should have RLS enabled.
-- The backend connects with the service_role key (see
-- src/config/supabaseClient.js), which bypasses RLS entirely, so no
-- policies are defined here — add some only if this table is ever queried
-- directly via PostgREST/anon or authenticated Supabase keys, which this
-- backend does not do today.
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
