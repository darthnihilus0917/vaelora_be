const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getAll,
  getById,
  create,
  update,
  remove,
  listImages,
  uploadImages,
  setDefaultImage,
  deleteProductImage,
} = require('../controllers/productsController');

const router = express.Router();

router.use(authenticate);

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', requireRole('admin', 'superadmin'), create);
router.put('/:id', requireRole('admin', 'superadmin'), update);
router.delete('/:id', requireRole('admin', 'superadmin'), remove);

router.get('/:id/images', listImages);
router.post(
  '/:id/images',
  requireRole('admin', 'superadmin'),
  (req, res, next) => {
    upload.array('images', 10)(req, res, (err) => {
      if (err) return next({ status: 400, message: err.message || 'Image upload failed' });
      next();
    });
  },
  uploadImages,
);
router.patch('/:id/images/:imageId/default', requireRole('admin', 'superadmin'), setDefaultImage);
router.delete('/:id/images/:imageId', requireRole('admin', 'superadmin'), deleteProductImage);

module.exports = router;
