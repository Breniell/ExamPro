// routes/teacherReports.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const reportsService = require('../services/reportsService');

// Agrégats pour les rapports (utilisé par TeacherReports.tsx)
router.get(
  '/reports/aggregates',
  authenticateToken,
  requireRole(['teacher']),
  async (req, res, next) => {
    try {
      const teacherId = req.user.id;
      const { examId, from, to } = req.query;
      const agg = await reportsService.getAggregates({ teacherId, examId, from, to });
      res.json(agg);
    } catch (e) { next(e); }
  }
);

// Export GLOBAL (PDF/XLSX) des rapports (multi-exams)
router.get(
  '/reports/export',
  authenticateToken,
  requireRole(['teacher']),
  async (req, res, next) => {
    try {
      const teacherId = req.user.id;
      const { format = 'pdf', examId, from, to, status, q } = req.query;
      if (!['pdf', 'xlsx'].includes(format)) {
        return res.status(400).json({ message: 'format must be pdf|xlsx' });
      }
      const { stream, filename, contentType } = await reportsService.exportReport({
        teacherId, format, examId, from, to, status, q
      });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      stream.pipe(res);
    } catch (e) { next(e); }
  }
);

module.exports = router;
