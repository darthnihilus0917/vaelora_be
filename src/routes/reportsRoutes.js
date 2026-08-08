const express = require('express');
const { authenticate } = require('../middleware/auth');
const { dashboardSummary, marketSales, inventoryAging, profitReport } = require('../controllers/reportsController');

const router = express.Router();

// Read-only; was previously fully open (no auth at all).
router.use(authenticate);

router.get('/dashboard-summary', dashboardSummary);
router.get('/market-sales', marketSales);
router.get('/inventory-aging', inventoryAging);
router.get('/profit', profitReport);

module.exports = router;
