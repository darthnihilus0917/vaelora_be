const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAll, getById, create, update, patch, remove } = require('../controllers/brandsController');

const router = express.Router();

// Was previously fully open (no auth at all).
router.use(authenticate);

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', requireRole('admin', 'superadmin'), create);
router.put('/:id', requireRole('admin', 'superadmin'), update);
router.patch('/:id', requireRole('admin', 'superadmin'), patch);
router.delete('/:id', requireRole('admin', 'superadmin'), remove);

module.exports = router;
