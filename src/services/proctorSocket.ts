// src/services/proctorSocket.ts
import { io, Socket } from 'socket.io-client';

function wsBase(): string {
  const env: any = import.meta.env;
  if (env?.VITE_WS_URL) return env.VITE_WS_URL; // ← mets ici http://<IP-LAN>:3001 en dev multi-appareils
  // ⬇️ par défaut, même origin que le front (évite "localhost" côté mobile)
  if (typeof window !== 'undefined') return window.location.origin;
  // fallback CLI/build
  if (env?.VITE_API_URL) {
    try { return new URL(env.VITE_API_URL).origin; } catch {}
  }
  return 'http://localhost:3001';
}

/** Connexion au namespace /proctor en utilisant le même path que le serveur */
export function connectProctorSocket(token: string): Socket {
  return io(`${wsBase()}/proctor`, {
    path: '/ws/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    forceNew: true,
    timeout: 20000,
    auth: { token },
  });
}

/** STUN/TURN issu de l'env, avec fallback */
export function iceServers() {
  const env: any = import.meta.env;
  const servers: RTCIceServer[] = [];

  if (env?.VITE_STUN_URL) {
    servers.push({ urls: env.VITE_STUN_URL });
  } else {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  if (env?.VITE_TURN_URL && env?.VITE_TURN_USERNAME && env?.VITE_TURN_CREDENTIAL) {
    servers.push({
      urls: env.VITE_TURN_URL,
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }

  return servers;
}
