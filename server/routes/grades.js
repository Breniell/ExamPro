// routes/grades.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const gradeController = require('../controllers/gradeController');

const router = express.Router();

// LISTE des sessions à corriger / corrigées
// GET /api/grades/sessions?examId=&status=submitted|graded
router.get(
  '/sessions',
  authenticateToken,
  requireRole(['teacher']),
  gradeController.listSessions
);

// DÉTAIL d’une session (questions, réponses, notes)
router.get(
  '/sessions/:sessionId',
  authenticateToken,
  requireRole(['teacher']),
  gradeController.getSession
);

// NOTER une question
router.post(
  '/sessions/:sessionId/questions/:questionId',
  authenticateToken,
  requireRole(['teacher']),
  [
    body('points_awarded').isNumeric(),
    body('feedback').optional().isString()
  ],
  gradeController.grade
);

// FINALISER la correction d’une session
router.post(
  '/sessions/:sessionId/finalize',
  authenticateToken,
  requireRole(['teacher']),
  gradeController.finalize
);

// EXPORTER le PDF d’une session (copie)
router.get(
  '/sessions/:sessionId/export/pdf',
  authenticateToken,
  requireRole(['teacher']),
  gradeController.exportSessionPdf
);

module.exports = router;
