// src/routes/exams.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const examController = require('../controllers/examController');

const router = express.Router();

// GET /api/exams
router.get('/', authenticateToken, examController.list);

// GET /api/exams/:id
router.get('/:id', authenticateToken, examController.getById);

// POST /api/exams
router.post(
  '/',
  authenticateToken,
  requireRole(['teacher']),
  [
    body('title').trim().notEmpty(),
    body('duration_minutes').isInt({ min: 1 }),
    body('start_date').isISO8601(),
    body('questions').isArray({ min: 1 })
  ],
  examController.create
);

// PATCH /api/exams/:id/status
router.patch(
  '/:id/status',
  authenticateToken,
  requireRole(['teacher','admin']),
  body('status').isIn(['draft','published','active','completed','archived']),
  examController.updateStatus
);

module.exports = router;
