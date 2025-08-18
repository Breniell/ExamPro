// src/controllers/sessionController.js
const { validationResult } = require('express-validator');
const sessionService = require('../services/sessionService');
const { emitSecurityLog } = require('../socket/proctor'); // 👈 diffusion temps réel

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

async function start(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const session = await sessionService.startSession({
      examId: req.body.exam_id,
      studentId: req.user.id,
      ip: req.ip,
      ua: req.get('User-Agent'),
    });
    res.status(201).json(session);
  } catch (err) {
    console.error('Start session error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const session = await sessionService.getSession(req.params.id, req.user);
    res.json(session);
  } catch (err) {
    console.error('Get session error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function answer(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const ans = await sessionService.submitAnswer({
      sessionId: req.params.id,
      questionId: req.body.question_id,
      answerText: req.body.answer_text,
      selectedOption: req.body.selected_option,
      timeSpent: req.body.time_spent,
      studentId: req.user.id,
    });
    res.json(ans);
  } catch (err) {
    console.error('Submit answer error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function submit(req, res) {
  try {
    const session = await sessionService.submitExam(req.params.id, req.user.id);

    // 🔎 Log non-bloquant “exam_submitted” + diffusion live
    try {
      const logRow = await sessionService.logSecurityEvent({
        sessionId: req.params.id,
        eventType: 'exam_submitted',
        eventData: { by: req.user.id },
        severity: 'low',
      });
      if (logRow) emitSecurityLog(logRow);
    } catch (e) {
      // on n’échoue pas la soumission pour un log informatif
      console.warn('submit() logSecurityEvent failed (non-blocking):', e?.message || e);
    }

    res.json({ message: 'Exam submitted', session });
  } catch (err) {
    console.error('Submit exam error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function logSecurity(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { event_type, event_data, severity = 'low' } = req.body;

  if (!VALID_SEVERITIES.has(severity)) {
    return res.status(400).json({ error: 'Invalid severity (expected low|medium|high)' });
  }

  try {
    // 👉 IMPORTANT : on attend que le service RETOURNE la ligne insérée
    const logRow = await sessionService.logSecurityEvent({
      sessionId: req.params.id,
      eventType: event_type,
      eventData: event_data,
      severity,
    });

    // Diffusion temps réel à tous les admins connectés
    if (logRow) emitSecurityLog(logRow);

    // On renvoie la ligne créée (meilleur DX côté FE)
    return res.status(201).json(logRow || { message: 'Security event logged' });
  } catch (err) {
    console.error('Security log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { start, getById, answer, submit, logSecurity };
