// src/controllers/examController.js
const { validationResult } = require('express-validator');
const examService = require('../services/examService');

async function list(req, res) {
  try {
    const scope = (req.query.scope || 'available').toString();
    const data = await examService.listExamsForUser(req.user, { scope });
    res.json(data);
  } catch (err) {
    console.error('List exams error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const exam = await examService.getExamById(req.params.id, req.user);
    res.json(exam);
  } catch (err) {
    console.error('Get exam error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function create(req, res) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const exam = await examService.createExam(req.body, req.user);
    res.status(201).json(exam);
  } catch (err) {
    console.error('Create exam error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

async function updateStatus(req, res) {
  try {
    const exam = await examService.updateExamStatus(req.params.id, req.body.status, req.user);
    res.json(exam);
  } catch (err) {
    console.error('Update status error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
}

module.exports = { list, getById, create, updateStatus };
