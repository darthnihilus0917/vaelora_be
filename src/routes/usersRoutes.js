const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAll, updateRole, deactivate, activate } = require('../controllers/usersController');

const router = express.Router();

router.use(authenticate, requireRole('superadmin'));

router.get('/', getAll);
router.patch('/:id/role', updateRole);
router.patch('/:id/deactivate', deactivate);
router.patch('/:id/activate', activate);

module.exports = router;
