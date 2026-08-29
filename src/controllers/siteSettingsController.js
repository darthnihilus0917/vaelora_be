const supabase = require('../config/supabaseClient');
const { uploadSiteImage, deleteImage } = require('../utils/r2Storage');

// site_settings is a singleton table (id = 1, enforced by a CHECK
// constraint) — see sql/2026-08-29_create_site_settings.sql.
const SETTINGS_ID = 1;

async function fetchSettingsRow() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .single();
  if (error) throw { status: 400, message: error.message };
  return data;
}

// GET /settings/hero-image — authenticated, any role. Returns the full row
// (including the storage key) since this is only reachable by logged-in
// staff, not the public.
const getHeroImage = async (req, res, next) => {
  try {
    const data = await fetchSettingsRow();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /public/hero-image — unauthenticated. Exposes only the URL, matching
// how publicProductsController limits which columns reach the storefront.
const getPublicHeroImage = async (req, res, next) => {
  try {
    const data = await fetchSettingsRow();
    res.json({ success: true, data: { url: data.hero_image_url } });
  } catch (err) {
    next(err);
  }
};

// POST /settings/hero-image (multipart/form-data, field "image", single
// file) — admin/superadmin only. Replaces whatever hero image is set.
const uploadHeroImage = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) throw { status: 400, message: 'An image file is required (field name: image)' };

    const previous = await fetchSettingsRow();

    const { key, url } = await uploadSiteImage('hero', file);

    const { data, error } = await supabase
      .from('site_settings')
      .update({ hero_image_url: url, hero_image_storage_key: key, updated_at: new Date().toISOString() })
      .eq('id', SETTINGS_ID)
      .select()
      .single();

    if (error) {
      // Best-effort cleanup so a failed update doesn't orphan the R2 object.
      await deleteImage(key).catch(() => {});
      throw { status: 400, message: error.message };
    }

    if (previous.hero_image_storage_key) {
      await deleteImage(previous.hero_image_storage_key).catch(() => {});
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// DELETE /settings/hero-image — admin/superadmin only. Clears the setting.
const deleteHeroImage = async (req, res, next) => {
  try {
    const previous = await fetchSettingsRow();

    const { data, error } = await supabase
      .from('site_settings')
      .update({ hero_image_url: null, hero_image_storage_key: null, updated_at: new Date().toISOString() })
      .eq('id', SETTINGS_ID)
      .select()
      .single();

    if (error) throw { status: 400, message: error.message };

    if (previous.hero_image_storage_key) {
      await deleteImage(previous.hero_image_storage_key).catch(() => {});
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getHeroImage, getPublicHeroImage, uploadHeroImage, deleteHeroImage };
