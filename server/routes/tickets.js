// src/routes/tickets.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ticketController = require('../controllers/ticketController');

const router = express.Router();

// GET /api/tickets
router.get('/', authenticateToken, ticketController.list);

// GET /api/tickets/:id
router.get('/:id', authenticateToken, ticketController.getById);

// POST /api/tickets
router.post(
  '/',
  authenticateToken,
  [
    body('subject').notEmpty(),
    body('description').notEmpty()
  ],
  ticketController.create
);

// PUT /api/tickets/:id
router.put(
  '/:id',
  authenticateToken,
  [
    body('subject').optional().notEmpty(),
    body('description').optional().notEmpty(),
    body('status').optional().isIn(['open','in_progress','resolved','closed'])
  ],
  ticketController.update
);

// DELETE /api/tickets/:id
router.delete('/:id', authenticateToken, ticketController.remove);

module.exports = router;
