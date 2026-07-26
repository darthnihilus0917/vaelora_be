const express = require('express');
const { getMovements, getSale, updateStatus } = require('../controllers/inventoryItemExtrasController');

const router = express.Router();

router.get('/:id/movements', getMovements);
router.get('/:id/sale', getSale);
router.patch('/:id/status', updateStatus);

module.exports = router;
