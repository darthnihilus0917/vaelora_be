const express = require('express');
const { getAll, getById } = require('../controllers/publicProductsController');
const { getPublicHeroImage } = require('../controllers/siteSettingsController');

const router = express.Router();

// Intentionally no `authenticate` here — this is the public storefront catalog.
// See docs/public-storefront-backend-handover.md.
router.get('/products', getAll);
router.get('/products/:id', getById);
router.get('/hero-image', getPublicHeroImage);

module.exports = router;
