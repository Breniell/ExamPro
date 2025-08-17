// src/controllers/authController.js
const { validationResult } = require('express-validator');
const authService = require('../services/authService');

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { user, token } = await authService.registerUser(req.body);
    res.status(201).json({ message: 'User created', user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { user, token } = await authService.loginUser(req.body);
    res.json({ message: 'Login successful', user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function me(req, res) {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    res.json({ user });
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function logout(req, res) {
  // Côté client suffit de détruire le token
  res.json({ message: 'Logout successful' });
}

module.exports = {
  register,
  login,
  me,
  logout,
};
