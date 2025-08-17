// src/controllers/questionController.js
const { validationResult } = require('express-validator');
const questionService = require('../services/questionService');

async function list(req, res) {
  try {
    const questions = await questionService.listQuestions(req.query);
    res.json(questions);
  } catch (err) {
    console.error('List questions error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getById(req, res) {
  try {
    const question = await questionService.getQuestion(req.params.id);
    res.json(question);
  } catch (err) {
    console.error('Get question error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const q = await questionService.createQuestion(req.body);
    res.status(201).json(q);
  } catch (err) {
    console.error('Create question error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const q = await questionService.updateQuestion(req.params.id, req.body);
    res.json(q);
  } catch (err) {
    console.error('Update question error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    await questionService.deleteQuestion(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, getById, create, update, remove };
