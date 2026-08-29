const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getHeroImage, uploadHeroImage, selectHeroImage, deleteHeroImage } = require('../controllers/siteSettingsController');

const router = express.Router();

router.use(authenticate);

router.get('/hero-image', getHeroImage);
router.post(
  '/hero-image',
  requireRole('admin', 'superadmin'),
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) return next({ status: 400, message: err.message || 'Image upload failed' });
      next();
    });
  },
  uploadHeroImage,
);
router.post('/hero-image/select', requireRole('admin', 'superadmin'), selectHeroImage);
router.delete('/hero-image', requireRole('admin', 'superadmin'), deleteHeroImage);

module.exports = router;
