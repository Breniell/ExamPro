// src/controllers/profileController.js
const { validationResult } = require('express-validator');
const profileService = require('../services/profileService');

async function getMe(req, res) {
  try {
    const profile = await profileService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function updateMe(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const profile = await profileService.updateProfile(req.user.id, req.body);
    res.json(profile);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function changePassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    await profileService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { getMe, updateMe, changePassword };
