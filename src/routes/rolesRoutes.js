const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAll, getByName, create, update, remove } = require('../controllers/rolesController');

const router = express.Router();

router.use(authenticate);

// Any authenticated user can read roles (needed for role dropdowns on
// invite/role-change forms); only superadmin can mutate them.
router.get('/', getAll);
router.get('/:name', getByName);
router.post('/', requireRole('superadmin'), create);
router.patch('/:name', requireRole('superadmin'), update);
router.delete('/:name', requireRole('superadmin'), remove);

module.exports = router;
