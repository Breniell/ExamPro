// src/routes/questions.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const questionController = require('../controllers/questionController');

const router = express.Router();

// GET /api/questions
router.get('/', authenticateToken, questionController.list);

// GET /api/questions/:id
router.get('/:id', authenticateToken, questionController.getById);

// POST /api/questions
router.post(
  '/',
  authenticateToken,
  requireRole(['teacher','admin']),
  [
    body('text').notEmpty(),
    body('type').isIn(['qcm','text','true_false']),
    body('options').optional().isArray()
  ],
  questionController.create
);

// PUT /api/questions/:id
router.put(
  '/:id',
  authenticateToken,
  requireRole(['teacher','admin']),
  [
    body('text').optional().notEmpty(),
    body('type').optional().isIn(['qcm','text','true_false']),
    body('options').optional().isArray()
  ],
  questionController.update
);

// DELETE /api/questions/:id
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['teacher','admin']),
  questionController.remove
);

module.exports = router;
