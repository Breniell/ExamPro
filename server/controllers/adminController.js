const { validationResult } = require('express-validator');
const adminService = require('../services/adminService');
const bcrypt = require('bcryptjs');

//
// === DASHBOARD STATS ===
//
exports.getUserStats = async (req, res) => {
  try {
    const stats = await adminService.getUserStats();
    res.json(stats);
  } catch (err) {
    console.error('Error getUserStats:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques utilisateurs.' });
  }
};

exports.getActiveExamsCount = async (req, res) => {
  try {
    const count = await adminService.getActiveExamsCount();
    res.json({ count });
  } catch (err) {
    console.error('Error getActiveExamsCount:', err);
    res.status(500).json({ error: 'Erreur lors du comptage des examens actifs.' });
  }
};

exports.getActiveCamerasCount = async (req, res) => {
  try {
    const count = await adminService.getActiveCamerasCount();
    res.json({ count });
  } catch (err) {
    console.error('Error getActiveCamerasCount:', err);
    res.status(500).json({ error: 'Erreur lors du comptage des caméras actives.' });
  }
};

exports.getSecurityAlertsCount = async (req, res) => {
  try {
    const count = await adminService.getSecurityAlertsCount();
    res.json({ count });
  } catch (err) {
    console.error('Error getSecurityAlertsCount:', err);
    res.status(500).json({ error: 'Erreur lors du comptage des alertes de sécurité.' });
  }
};

exports.getRecentAlerts = async (req, res) => {
  try {
    const alerts = await adminService.getRecentAlerts();
    res.json(alerts);
  } catch (err) {
    console.error('Error getRecentAlerts:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des alertes récentes.' });
  }
};

exports.getActiveExamsDetails = async (req, res) => {
  try {
    const exams = await adminService.getActiveExamsDetails();
    res.json(exams);
  } catch (err) {
    console.error('Error getActiveExamsDetails:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des examens actifs.' });
  }
};

// NEW: charts
exports.getAdminChartStats = async (req, res) => {
  try { res.json(await adminService.getAdminChartStats()); }
  catch (err) { console.error('Error getAdminChartStats:', err); res.status(500).json({ error: 'Erreur lors de la récupération des données graphiques.' }); }
};

exports.getSystemHealth = async (req, res) => {
  try {
    const health = await adminService.getSystemHealth();
    res.json(health);
  } catch (err) {
    console.error('Error getSystemHealth:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l’état du système.' });
  }
};


// -- SESSIONS ACTIVES --
exports.listActiveSessions = async (req, res) => {
  try {
    const sessions = await adminService.listActiveSessions();
    res.json(sessions);
  } catch (err) {
    console.error('Error listActiveSessions:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des sessions actives.' });
  }
};


//
// === UTILISATEURS CRUD ===
//
exports.listUsers = async (req, res) => {
  try {
    const users = await adminService.listUsers(req.query);
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { email, password, firstName, lastName, role } = req.body;
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS));
    const user = await adminService.createUser({ email, passwordHash, firstName, lastName, role });
    res.status(201).json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.updateUser = async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const user = await adminService.updateUser(req.params.id, req.body);
    res.json(user);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await adminService.deleteUser(req.params.id);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};


//
// === ALERTES DE SÉCURITÉ ===
//
exports.listSecurityLogs = async (req, res) => {
  try {
    const logs = await adminService.listSecurityLogs(req.query);
    res.json(logs);
  } catch (err) {
    console.error('List security logs error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.resolveSecurityLog = async (req, res) => {
  try {
    const log = await adminService.resolveSecurityLog(req.params.id);
    res.json(log);
  } catch (err) {
    console.error('Resolve security log error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};


//
// === PARAMÈTRES DU SYSTÈME ===
//
exports.getSettings = async (req, res) => {
  try {
    const settings = await adminService.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await adminService.updateSettings(req.body, req.user.id);
    res.json(settings);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};
exports.getDashboardOverview = async (req, res) => {
  try {
    const [
      userStats,
      activeExamsCount,
      activeCamerasCount,
      securityAlertsCount,
      recentAlerts,
      activeExamsDetails,
      systemHealth
    ] = await Promise.all([
      adminService.getUserStats(),
      adminService.getActiveExamsCount(),
      adminService.getActiveCamerasCount(),
      adminService.getSecurityAlertsCount(),
      adminService.getRecentAlerts(6),
      adminService.getActiveExamsDetails(),
      adminService.getSystemHealth()
    ]);

    res.json({
      userStats,
      activeExamsCount,
      activeCamerasCount,
      securityAlertsCount,
      recentAlerts,
      activeExams: activeExamsDetails,
      systemHealth
    });
  } catch (err) {
    console.error('Dashboard overview error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du tableau de bord.' });
  }
};
