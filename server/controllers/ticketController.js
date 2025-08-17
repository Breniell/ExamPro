// src/controllers/ticketController.js
const { validationResult } = require('express-validator');
const ticketService = require('../services/ticketService');

async function list(req, res) {
  try {
    const tickets = await ticketService.listTickets(req.user);
    res.json(tickets);
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getById(req, res) {
  try {
    const ticket = await ticketService.getTicket(req.params.id, req.user);
    res.json(ticket);
  } catch (err) {
    console.error('Get ticket error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const ticket = await ticketService.createTicket({
      subject: req.body.subject,
      description: req.body.description,
      createdBy: req.user.id
    });
    res.status(201).json(ticket);
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function update(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const ticket = await ticketService.updateTicket(req.params.id, req.body, req.user);
    res.json(ticket);
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    await ticketService.deleteTicket(req.params.id, req.user);
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    console.error('Delete ticket error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, getById, create, update, remove };
