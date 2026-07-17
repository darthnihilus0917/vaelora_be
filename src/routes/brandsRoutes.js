const express = require('express');
const { getAll, getById, create, update, patch, remove } = require('../controllers/brandsController');

const router = express.Router();

router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id', patch);
router.delete('/:id', remove);

module.exports = router;
