const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Protégé + rôle admin
router.use(authMiddleware.authenticateToken);
router.use(authMiddleware.requireRole('admin'));

// -- ROUTES ADMIN -- 
router.get('/sessions/active', adminController.listActiveSessions);

// Dashboard
router.get('/dashboard', adminController.getDashboardOverview);

// STATS
router.get('/stats/users', adminController.getUserStats);
router.get('/stats/active-exams', adminController.getActiveExamsCount);
router.get('/stats/active-cameras', adminController.getActiveCamerasCount);
router.get('/stats/security-alerts', adminController.getSecurityAlertsCount);
router.get('/stats/chart', adminController.getAdminChartStats); // ← NEW

// alertes + exams + health
router.get('/alerts/recent', adminController.getRecentAlerts);
router.get('/exams/active', adminController.getActiveExamsDetails);
router.get('/system/health', adminController.getSystemHealth);

// USERS CRUD
router.get('/users', adminController.listUsers);
router.post(
  '/users',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
    body('role').isIn(['student', 'teacher', 'admin'])
  ],
  adminController.createUser
);
router.put(
  '/users/:id',
  [
    body('firstName').optional().notEmpty(),
    body('lastName').optional().notEmpty(),
    body('role').optional().isIn(['student', 'teacher', 'admin']),
    body('isActive').optional().isBoolean()
  ],
  adminController.updateUser
);
router.delete('/users/:id', adminController.deleteUser);

// Logs sécurité
router.get('/security-logs', adminController.listSecurityLogs);
router.patch('/security-logs/:id/resolve', adminController.resolveSecurityLog);

// Paramètres système
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
