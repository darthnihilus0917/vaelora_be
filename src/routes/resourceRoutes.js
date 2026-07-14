const express = require('express');
const buildCrudHandlers = require('../utils/crudFactory');

function buildResourceRouter(table, options) {
  const router = express.Router();
  const handlers = buildCrudHandlers(table, options);

  router.get('/', handlers.getAll);

  if (options.writable) {
    router.get('/:id', handlers.getById);
    router.post('/', handlers.create);
    router.put('/:id', handlers.update);
    router.delete('/:id', handlers.remove);
  }

  return router;
}

module.exports = buildResourceRouter;
