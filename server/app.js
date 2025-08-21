// app.js
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
require('dotenv').config();

// Import des routes
const authRoutes         = require('./routes/auth');
const examRoutes         = require('./routes/exams');
const sessionRoutes      = require('./routes/sessions');
const gradeRoutes        = require('./routes/grades');
const adminRoutes        = require('./routes/admin');
const adminDashboardRoutes = require('./routes/adminDashboard');
const questionRoutes     = require('./routes/questions');
const profileRoutes      = require('./routes/profile');
const notificationRoutes = require('./routes/notifications');
const ticketRoutes       = require('./routes/tickets');
const teacherReportsRouter = require('./routes/teacherReports');

const app = express();

// --- Middleware de sécurité ---
app.use(helmet({
  crossOriginResourcePolicy: false, // API only; pas de statiques sensibles ici
}));

// CORS : autoriser plusieurs origines via env CORS_ORIGIN (séparées par des virgules)
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const defaultDevOrigin = 'http://localhost:5173';
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (corsOrigins.length) {
      return corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'));
    }
    if (process.env.NODE_ENV === 'production') {
      return origin === 'https://your-domain.com' ? cb(null, true) : cb(new Error('Not allowed by CORS'));
    }
    return origin === defaultDevOrigin ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiter global (defaults sûrs)
const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10);
const maxReq = parseInt(process.env.RATE_LIMIT_MAX || '300', 10);
app.use(rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max: maxReq,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP' }
}));

// --- Body parsing ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Proxy et trust ---
app.set('trust proxy', 1);

// --- Enregistrement des routes ---
// Authentification
app.use('/api/auth', authRoutes);

// Examens
app.use('/api/exams', examRoutes);

app.use('/api/admin/charts', require('./routes/adminCharts'));

// Sessions d’examen
app.use('/api/sessions', sessionRoutes);

// Correction / Grades
app.use('/api/grades', gradeRoutes);

// Admin (Users, Logs, Settings)
app.use('/api/admin', adminRoutes);

app.use('/api/admin', adminDashboardRoutes);

// Banque de questions
app.use('/api/questions', questionRoutes);

// Profil utilisateur
app.use('/api/profile', profileRoutes);

// Rapports enseignants (agrégats + exports globaux)
app.use('/api/teacher', teacherReportsRouter);

// Notifications
app.use('/api/notifications', notificationRoutes);

// Support / Tickets
app.use('/api/tickets', ticketRoutes);

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- Gestion des erreurs ---
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Démarrage du serveur ---
const http = require('http');
const { initProctoring } = require('./socket/proctor');

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// ⚡ sockets (WebRTC signaling)
initProctoring(server);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});

module.exports = server;
