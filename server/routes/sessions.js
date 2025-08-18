// src/routes/sessions.js
const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const sessionController = require('../controllers/sessionController');

const router = express.Router();

// POST /api/sessions/start
router.post(
  '/start',
  authenticateToken,
  requireRole(['student']),
  body('exam_id').isUUID().withMessage('exam_id doit être un UUID'),
  sessionController.start
);

// GET /api/sessions/:id
router.get(
  '/:id',
  authenticateToken,
  param('id').isUUID().withMessage('Session id invalide'),
  sessionController.getById
);

// POST /api/sessions/:id/answers
router.post(
  '/:id/answers',
  authenticateToken,
  [
    param('id').isUUID().withMessage('Session id invalide'),
    body('question_id').isUUID().withMessage('question_id requis et doit être un UUID'),
    body('time_spent').optional().isInt({ min: 0 }).withMessage('time_spent doit être un entier >= 0'),
    body('selected_option').optional({ nullable: true }).isString().withMessage('selected_option doit être une chaîne'),
    body('answer_text').optional({ nullable: true }).isString().withMessage('answer_text doit être une chaîne'),
  ],
  sessionController.answer
);

// POST /api/sessions/:id/submit
router.post(
  '/:id/submit',
  authenticateToken,
  requireRole(['student']),
  param('id').isUUID().withMessage('Session id invalide'),
  sessionController.submit
);

// POST /api/sessions/:id/security-log
router.post(
  '/:id/security-log',
  authenticateToken,
  requireRole(['student']),
  [
    param('id').isUUID().withMessage('Session id invalide'),
    body('event_type').isString().notEmpty().withMessage('event_type requis'),
    body('event_data').optional({ nullable: true }),
    body('severity').optional().isIn(['low','medium','high']).withMessage('severity invalide'),
  ],
  sessionController.logSecurity
);

module.exports = router;
