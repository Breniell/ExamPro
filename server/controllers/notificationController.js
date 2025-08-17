// src/controllers/notificationController.js
const { validationResult } = require('express-validator');
const notificationService = require('../services/notificationService');

async function list(req, res) {
  try {
    const notes = await notificationService.listNotifications(req.user.id);
    res.json(notes);
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const note = await notificationService.createNotification({
      userId: req.body.userId,
      type: req.body.type,
      message: req.body.message
    });
    res.status(201).json(note);
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function markRead(req, res) {
  try {
    const note = await notificationService.markAsRead(req.params.id, req.user.id);
    res.json(note);
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    await notificationService.deleteNotification(req.params.id, req.user.id);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, create, markRead, remove };
