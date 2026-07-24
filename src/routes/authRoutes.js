const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { register, invite, login, logout, refresh, me } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
router.post('/invite', authenticate, requireRole('admin', 'superadmin'), invite);

module.exports = router;
