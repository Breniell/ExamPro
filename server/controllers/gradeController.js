// controllers/gradeController.js
const gradeService = require('../services/gradeService');
const reportsService = require('../services/reportsService');

/* ============== ÉTUDIANT ============== */
exports.studentGrades = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { from, to, q, status } = req.query; // optionnels
    const rows = await gradeService.listStudentGrades(studentId, { from, to, q, status });
    res.json({ items: rows, total: rows.length });
  } catch (e) {
    // Ajout de logs utiles
    console.error('GET /api/grades/student failed:', e && e.code, e && e.message);
    // Si c'est une colonne inconnue, on renvoie un message clair (sinon, middleware d'erreur gère)
    if (e && e.code === '42703') {
      return res.status(500).json({ error: 'La base ne contient pas toutes les colonnes attendues pour /api/grades/student. La requête a été ajustée mais a échoué.' });
    }
    next(e);
  }
};

/* ============== ENSEIGNANT ============== */
exports.listSessions = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { examId, status, from, to, q, page, pageSize } = req.query;
    const out = await reportsService.listSessions({
      teacherId,
      examId,
      status,
      from,
      to,
      q,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 15,
    });
    res.json(out); // { items, total }
  } catch (e) { next(e); }
};

exports.getSession = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { sessionId } = req.params;
    const detail = await gradeService.getSessionForGrading(sessionId, teacherId);
    res.json(detail);
  } catch (e) { next(e); }
};

exports.grade = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { sessionId, questionId } = req.params;
    const { points_awarded, feedback } = req.body;

    const n = Number(points_awarded);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'points_awarded must be a number >= 0' });
    }

    const out = await gradeService.gradeQuestion({
      sessionId,
      questionId,
      teacherId,
      pointsAwarded: n,
      feedback: feedback || null
    });
    res.json(out);
  } catch (e) { next(e); }
};

exports.finalize = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { sessionId } = req.params;
    const out = await gradeService.finalizeGrading(sessionId, teacherId);
    res.json(out);
  } catch (e) { next(e); }
};

exports.exportSessionPdf = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { sessionId } = req.params;
    const { stream, filename } = await reportsService.exportSessionPdf({ teacherId, sessionId });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  } catch (e) { next(e); }
};
