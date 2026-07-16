const express = require('express');
const { dashboardSummary, marketSales, inventoryAging, profitReport } = require('../controllers/reportsController');

const router = express.Router();

router.get('/dashboard-summary', dashboardSummary);
router.get('/market-sales', marketSales);
router.get('/inventory-aging', inventoryAging);
router.get('/profit', profitReport);

module.exports = router;
