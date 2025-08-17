// server/routes/adminDashboard.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminDashboardController');

router.use(authenticateToken, requireRole(['admin']));

router.get('/exams/active/count', ctrl.getActiveExamsCount);
router.get('/exams/active', ctrl.getActiveExams);
router.get('/cameras/active/count', ctrl.getActiveCamerasCount);
router.get('/health', ctrl.getSystemHealth);

module.exports = router;
