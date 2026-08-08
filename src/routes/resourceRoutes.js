const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const buildCrudHandlers = require('../utils/crudFactory');

function buildResourceRouter(table, options) {
  const router = express.Router();
  const handlers = buildCrudHandlers(table, options);

  // All resource data requires a logged-in user; only admin/superadmin may
  // write. Previously this router had no auth at all (open read+write).
  router.use(authenticate);

  router.get('/', handlers.getAll);

  if (options.writable) {
    router.get('/:id', handlers.getById);
    router.post('/', requireRole('admin', 'superadmin'), handlers.create);
    router.put('/:id', requireRole('admin', 'superadmin'), handlers.update);
    router.delete('/:id', requireRole('admin', 'superadmin'), handlers.remove);
  }

  return router;
}

module.exports = buildResourceRouter;
