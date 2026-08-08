const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getMovements, getSale, updateStatus } = require('../controllers/inventoryItemExtrasController');

const router = express.Router();

// Was previously fully open (no auth at all).
router.use(authenticate);

router.get('/:id/movements', getMovements);
router.get('/:id/sale', getSale);
router.patch('/:id/status', requireRole('admin', 'superadmin'), updateStatus);

module.exports = router;
