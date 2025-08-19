// server/socket/proctor.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// --- État module ---
let ioRef = null;
// sessionId -> { students:Set<socketId>, admins:Set<socketId>, meta?:{examTitle?:string, studentName?:string} }
const rooms = new Map();
// Suivre quel socket étudiant appartient à quelle session
const studentToSession = new Map();

function getProctorSnapshot() {
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
  return payload; // { id/userId, role, ... }
}

function ensureRoom(sessionId) {
  let r = rooms.get(sessionId);
  if (!r) {
    r = { students: new Set(), admins: new Set(), meta: {} };
    rooms.set(sessionId, r);
  }
  return r;
}

// ⬇️ 1) Diffuser la présence à TOUS les admins (nsp.emit) + à la room
function broadcastPresence(nsp, sessionId, r) {
  const payload = {
    sessionId,
    students: r.students.size,
    admins: r.admins.size,
    meta: r.meta || {},
  };
  nsp.emit('presence', payload);                 // ← tous les admins
  nsp.to(`sess:${sessionId}`).emit('presence', payload); // ← membres de la room
}

function leaveAll(socket, nsp) {
  const sid = socket.id;
  const wasInSession = studentToSession.get(sid);

  for (const [sessionId, r] of rooms) {
    const before = { s: r.students.size, a: r.admins.size };
    r.students.delete(sid);
    r.admins.delete(sid);
    const after = { s: r.students.size, a: r.admins.size };

    if (before.s !== after.s || before.a !== after.a) {
      broadcastPresence(nsp, sessionId, r);
    }
    if (!r.students.size && !r.admins.size) {
      rooms.delete(sessionId);
    }
  }

  if (wasInSession) {
    studentToSession.delete(sid);
    nsp.emit('session-left', { sessionId: wasInSession, socketId: sid });
  }
}

function initProctoring(server) {
  // autoriser localhost/LAN en dev
  const allowDevOrigin = (origin) => {
    if (!origin) return true;
    const re = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
    return re.test(origin);
  };

  const prodOrigins = (process.env.FE_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean); // supporte plusieurs origines séparées par des virgules

  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (prodOrigins.length ? prodOrigins : true) // si FE_ORIGIN manquant → autorise (utile en préview)
        : (origin, cb) => cb(null, allowDevOrigin(origin)),
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
    socket.on('join-session', ({ sessionId }) => {
      if (!sessionId) return;
      const role = socket.user?.role;
      const r = ensureRoom(sessionId);

      if (role === 'admin') {
        r.admins.add(socket.id);
      } else {
        r.students.add(socket.id);
        studentToSession.set(socket.id, sessionId);
      }

      socket.join(`sess:${sessionId}`);
      broadcastPresence(nsp, sessionId, r);
    });

    // Métadonnées publiées par les étudiants
    socket.on('session-meta', ({ sessionId, examTitle, studentName }) => {
      if (!sessionId) return;
      const r = ensureRoom(sessionId);
      r.meta = {
        ...(r.meta || {}),
        ...(examTitle ? { examTitle } : {}),
        ...(studentName ? { studentName } : {}),
      };

      nsp.emit('session-meta', {
        sessionId,
        examTitle: r.meta.examTitle || null,
        studentName: r.meta.studentName || null,
        socketId: socket.id,
      });

      broadcastPresence(nsp, sessionId, r);
    });

    // ADMIN: liste des sessions actives
    socket.on('list-sessions', () => {
      if (socket.user?.role !== 'admin') return;
      const list = Array.from(rooms.entries()).map(([sessionId, r]) => ({
        sessionId,
        students: r.students.size,
        admins: r.admins.size,
        examTitle: r.meta?.examTitle || null,
        studentName: r.meta?.studentName || null,
      }));
      socket.emit('sessions-list', list);
    });

    // ⬇️ 3) ADMIN: regarder une session → on JOINT la room et on déclenche la requête d’offre
    socket.on('watch-session', ({ sessionId }) => {
      if (socket.user?.role !== 'admin') return;
      if (!sessionId) return;
      const r = ensureRoom(sessionId);
      r.admins.add(socket.id);
      socket.join(`sess:${sessionId}`);
      broadcastPresence(nsp, sessionId, r);

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

function emitSecurityLog(logRow) {
  if (!ioRef) return;
  ioRef.of('/proctor').emit('security-log', logRow);
}

function emitSecurityLogResolved(payload) {
  if (!ioRef) return;
  ioRef.of('/proctor').emit('security-log-resolved', payload);
}

module.exports = {
  initProctoring,
  getProctorSnapshot,
  emitSecurityLog,
  emitSecurityLogResolved,
};
