const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { loginLimiter, authLimiter } = require('../middleware/rateLimit');
const { register, invite, login, logout, refresh, me } = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', authLimiter, refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
router.post('/invite', authLimiter, authenticate, requireRole('admin', 'superadmin'), invite);

module.exports = router;
