// src/routes/profile.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

const router = express.Router();

router.get(
  '/me',
  authenticateToken,
  profileController.getMe
);

router.put(
  '/me',
  authenticateToken,
  [
    body('firstName').optional().notEmpty(),
    body('lastName').optional().notEmpty(),
    body('avatar').optional().isURL()
  ],
  profileController.updateMe
);

router.post(
  '/me/change-password',
  authenticateToken,
  [
    body('oldPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 })
  ],
  profileController.changePassword
);

module.exports = router;
