const express = require('express');
const { getMovements, getSale } = require('../controllers/inventoryItemExtrasController');

const router = express.Router();

router.get('/:id/movements', getMovements);
router.get('/:id/sale', getSale);

module.exports = router;
