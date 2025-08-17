// src/routes/notifications.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

// GET /api/notifications
router.get('/', authenticateToken, notificationController.list);

// POST /api/notifications  (admin ou système uniquement)
// Création d'une notification : seulement les administrateurs peuvent créer des notifications
router.post(
  '/',
  authenticateToken,
  requireRole(['admin']),
  [
    body('userId').isUUID(),
    body('type').isString().notEmpty(),
    body('message').isString().notEmpty()
  ],
  notificationController.create
);

// PATCH /api/notifications/:id/read
router.patch(
  '/:id/read',
  authenticateToken,
  notificationController.markRead
);

// DELETE /api/notifications/:id
router.delete(
  '/:id',
  authenticateToken,
  notificationController.remove
);

module.exports = router;
