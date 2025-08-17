// server/socket/proctor.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// --- État module (réutilisable par les routes HTTP) ---
let ioRef = null;
// sessionId -> { students:Set<socketId>, admins:Set<socketId>, meta?:{examTitle?:string, studentName?:string} }
const rooms = new Map();

function getProctorSnapshot() {
  // retourne une vue consolidée pour les routes HTTP
  const list = Array.from(rooms.entries()).map(([sessionId, r]) => ({
    sessionId,
    students: r.students.size,
    admins: r.admins.size,
    examTitle: r.meta?.examTitle || null,
  }));
  const activeStudents = list.reduce((sum, x) => sum + (x.students || 0), 0);
  return { rooms: list, activeStudents, ioReady: !!ioRef };
}

function authFromHandshake(socket) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) throw new Error('Missing token');
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload; // { id, role, ... } ou { userId, role, ... }
}

function ensureRoom(sessionId) {
  let r = rooms.get(sessionId);
  if (!r) {
    r = { students: new Set(), admins: new Set(), meta: {} };
    rooms.set(sessionId, r);
  }
  return r;
}

function leaveAll(socket, nsp) {
  for (const [sessionId, r] of rooms) {
    const before = { s: r.students.size, a: r.admins.size };
    r.students.delete(socket.id);
    r.admins.delete(socket.id);
    const after = { s: r.students.size, a: r.admins.size };

    // notifier si changement
    if (before.s !== after.s || before.a !== after.a) {
      nsp.to(`sess:${sessionId}`).emit('presence', {
        sessionId,
        students: r.students.size,
        admins: r.admins.size,
        meta: r.meta || {},
      });
      if (!r.students.size) {
        // avertir les admins que la session n’a plus d’étudiants
        nsp.emit('session-left', { sessionId });
      }
    }

    if (!r.students.size && !r.admins.size) rooms.delete(sessionId);
  }
}

function initProctoring(server) {
  const io = new Server(server, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.FE_ORIGIN
          : 'http://localhost:5173',
      credentials: true,
    },
    path: '/ws/socket.io',
  });
  ioRef = io;

  const nsp = io.of('/proctor');

  nsp.use((socket, next) => {
    try {
      socket.user = authFromHandshake(socket);
      next();
    } catch (err) {
      next(err);
    }
  });

  nsp.on('connection', (socket) => {
    // { sessionId }
    socket.on('join-session', ({ sessionId }) => {
      if (!sessionId) return;
      const role = socket.user?.role;
      const r = ensureRoom(sessionId);

      if (role === 'admin') r.admins.add(socket.id);
      else r.students.add(socket.id);

      socket.join(`sess:${sessionId}`);

      // présence
      nsp.to(`sess:${sessionId}`).emit('presence', {
        sessionId,
        students: r.students.size,
        admins: r.admins.size,
        meta: r.meta || {},
      });
    });

    // métadonnées publiées par les étudiants (et relayées aux admins)
    socket.on('session-meta', ({ sessionId, examTitle, studentName }) => {
      if (!sessionId) return;
      const r = ensureRoom(sessionId);
      r.meta = { ...(r.meta || {}), ...(examTitle ? { examTitle } : {}), ...(studentName ? { studentName } : {}) };

      // notifier tout le monde (les admins écoutent ça pour enrichir la grille)
      nsp.emit('session-meta', {
        sessionId,
        examTitle: r.meta.examTitle || null,
        studentName: r.meta.studentName || null,
        socketId: socket.id,
      });

      nsp.to(`sess:${sessionId}`).emit('presence', {
        sessionId,
        students: r.students.size,
        admins: r.admins.size,
        meta: r.meta || {},
      });
    });

    // ADMIN: liste des sessions actives
    socket.on('list-sessions', () => {
      if (socket.user?.role !== 'admin') return;
      const list = Array.from(rooms.entries()).map(([sessionId, r]) => ({
        sessionId,
        students: r.students.size,
        admins: r.admins.size,
        examTitle: r.meta?.examTitle || null,
      }));
      socket.emit('sessions-list', list);
    });

    // ADMIN: demande de regarder une session
    socket.on('watch-session', ({ sessionId }) => {
      if (socket.user?.role !== 'admin') return;
      if (!sessionId) return;
      nsp.to(`sess:${sessionId}`).emit('request-offer', {
        adminSocketId: socket.id,
        sessionId,
      });
    });

    // WebRTC bridge
    socket.on('webrtc-offer', ({ to, sessionId, description }) => {
      if (!to || !description) return;
      nsp.to(to).emit('webrtc-offer', { from: socket.id, sessionId, description });
    });

    socket.on('webrtc-answer', ({ to, sessionId, description }) => {
      if (!to || !description) return;
      nsp.to(to).emit('webrtc-answer', { from: socket.id, sessionId, description });
    });

    socket.on('webrtc-ice-candidate', ({ to, candidate, sessionId }) => {
      if (!to || !candidate) return;
      nsp.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate, sessionId });
    });

    socket.on('disconnect', () => {
      leaveAll(socket, nsp);
    });
  });

  return io;
}

module.exports = { initProctoring, getProctorSnapshot };
