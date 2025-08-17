// server/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Access token required' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Auth error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Ici decoded.userId doit correspondre à ce que tu signes au login
  // (si tu signes { id }, remplace par decoded.id)
  const userId = decoded.userId ?? decoded.id;
  if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
      [userId]
    );
    const u = result.rows[0];
    if (!u || !u.is_active) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }
    req.user = u;
    next();
  } catch (dbErr) {
    console.error('Auth DB error:', dbErr);
    return res.status(503).json({ error: 'Database temporarily unavailable' });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authenticateToken, requireRole };
