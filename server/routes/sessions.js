// src/routes/sessions.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const sessionController = require('../controllers/sessionController');

const router = express.Router();

// POST /api/sessions/start
router.post(
  '/start',
  authenticateToken,
  requireRole(['student']),
  body('exam_id').isUUID(),
  sessionController.start
);

// GET /api/sessions/:id
router.get(
  '/:id',
  authenticateToken,
  sessionController.getById
);

// POST /api/sessions/:id/answers
router.post(
  '/:id/answers',
  authenticateToken,
  requireRole(['student']),
  [
    body('question_id').isUUID(),
    body('time_spent').isInt({ min: 0 }),
    // answer_text or selected_option required – custom check
    body('answer_text').optional().isString(),
    body('selected_option').optional().isString(),
  ],
  sessionController.answer
);

// POST /api/sessions/:id/submit
router.post(
  '/:id/submit',
  authenticateToken,
  requireRole(['student']),
  sessionController.submit
);

// POST /api/sessions/:id/security-log
router.post(
  '/:id/security-log',
  authenticateToken,
  requireRole(['student']),
  [
    body('event_type').isString(),
    body('event_data').notEmpty(),
    body('severity').optional().isIn(['low','medium','high'])
  ],
  sessionController.logSecurity
);

module.exports = router;
