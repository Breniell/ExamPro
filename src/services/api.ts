// src/services/api.ts
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token: string) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  private buildQuery(params?: Record<string, any>): string {
    if (!params) return '';
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      usp.append(k, String(v));
    });
    const s = usp.toString();
    return s ? `?${s}` : '';
  }

  private makeHeaders(extra?: HeadersInit, hasBody?: boolean): HeadersInit {
    const base: HeadersInit = {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
    return { ...base, ...(extra || {}) };
  }

  private async requestJSON(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const hasBody = !!options.body && !(options.body instanceof FormData);
    const headers = this.makeHeaders(options.headers, hasBody);

    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const isJSON = contentType.includes('application/json');
    const data = isJSON ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) || `HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        this.clearToken(); // 🔐 purge token
      }
      throw new Error(message);
    }
    return data;
  }

  private async requestBlob(
    endpoint: string,
    options: RequestInit = {},
    accept: string = '*/*'
  ): Promise<Blob> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = this.makeHeaders(
      { Accept: accept, ...(options.headers || {}) },
      false
    );
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await res.json();
          msg = j?.message || j?.error || msg;
        } else {
          msg = await res.text();
        }
      } catch {}
      if (res.status === 401 || res.status === 403) this.clearToken();
      throw new Error(msg);
    }
    return await res.blob();
  }

  // ---------- Auth ----------
  async login(email: string, password: string) {
    const res = await this.requestJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res?.token) this.setToken(res.token);
    return res;
  }

  async register(userData: any) {
    const res = await this.requestJSON('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    if (res?.token) this.setToken(res.token);
    return res;
  }

  async resetPassword(email: string) {
    return this.requestJSON('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getCurrentUser() {
    const res = await this.requestJSON('/auth/me');
    // supporte /auth/me => { user } ou directement l’objet user
    return res?.user ?? res;
  }

  async logout() {
    try {
      await this.requestJSON('/auth/logout', { method: 'POST' });
    } catch {}
    this.clearToken();
  }

  // ---------- Exams ----------
  async getExams(params?: Record<string, string | number>) {
    const q = this.buildQuery(params);
    return this.requestJSON(`/exams${q}`);
  }

  async getExam(id: string) {
    return this.requestJSON(`/exams/${id}`);
  }

  async createExam(examData: any) {
    return this.requestJSON('/exams', {
      method: 'POST',
      body: JSON.stringify(examData),
    });
  }

  async updateExamStatus(id: string, status: string) {
    return this.requestJSON(`/exams/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // ---------- Sessions (étudiant) ----------
  async startExamSession(examId: string) {
    return this.requestJSON('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ exam_id: examId }),
    });
  }

  async getSession(id: string) {
    return this.requestJSON(`/sessions/${id}`);
  }

  async submitAnswer(sessionId: string, answerData: any) {
    return this.requestJSON(`/sessions/${sessionId}/answers`, {
      method: 'POST',
      body: JSON.stringify(answerData),
    });
  }

  async submitExam(sessionId: string) {
    return this.requestJSON(`/sessions/${sessionId}/submit`, { method: 'POST' });
  }

  async logSecurityEvent(sessionId: string, eventData: any) {
    return this.requestJSON(`/sessions/${sessionId}/security-log`, {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  // ---------- Grading (enseignant) ----------
  async getGradingSessions(params?: {
    examId?: string;
    status?: 'submitted' | 'graded';
    from?: string; // ISO
    to?: string;   // ISO
    q?: string;    // recherche nom/prénom / titre exam
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const q = this.buildQuery(params);
    return this.requestJSON(`/grades/sessions${q}`);
  }

  async getGradingSession(id: string) {
    return this.requestJSON(`/grades/sessions/${id}`);
  }

  async gradeQuestion(
    sessionId: string,
    questionId: string,
    gradeData: { points_awarded: number; feedback?: string }
  ) {
    return this.requestJSON(
      `/grades/sessions/${sessionId}/questions/${questionId}`,
      {
        method: 'POST',
        body: JSON.stringify(gradeData),
      }
    );
  }

  async finalizeGrading(sessionId: string) {
    return this.requestJSON(`/grades/sessions/${sessionId}/finalize`, {
      method: 'POST',
    });
  }

  // ---------- Rapports (enseignant) ----------
  async getReportAggregates(params: { examId?: string; from?: string; to?: string; }) {
    const q = this.buildQuery(params);
    return this.requestJSON(`/teacher/reports/aggregates${q}`);
  }

  async exportReport(params: {
    format: 'pdf' | 'xlsx';
    examId?: string;
    from?: string;
    to?: string;
    status?: 'submitted' | 'graded';
    q?: string;
  }): Promise<Blob> {
    const q = this.buildQuery(params);
    const accept =
      params.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return this.requestBlob(`/teacher/reports/export${q}`, {}, accept);
  }

  async exportSessionPdf(sessionId: string): Promise<Blob> {
    return this.requestBlob(`/grades/sessions/${sessionId}/export/pdf`, {}, 'application/pdf');
  }

  // ---------- Étudiant (notes/historique) ----------
  async getStudentGrades() { return this.requestJSON('/grades/student'); }
  async getGradeReport(sessionId: string) { return this.requestJSON(`/grades/student/${sessionId}`); }

  // ---------- Admin (ajouts attendus par ton Dashboard) ----------
  async getUsers(params?: Record<string, any>) {
    const q = this.buildQuery(params);
    return this.requestJSON(`/admin/users${q}`);
  }

  // Compte des examens actifs
  async getActiveExamsCount(): Promise<{ count: number }> {
    try {
      const r = await this.requestJSON('/admin/exams/active/count');
      if (typeof r === 'number') return { count: r };
      return { count: r?.count ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

    // ---------- Admin / Charts ----------
  async getAdminChartStats(): Promise<{ labels: string[]; userCounts: number[]; examCounts: number[]; }> {
    try {
      const res = await this.requestJSON('/admin/charts/overview');
      // normalise le résultat minimal pour éviter des plantages d'UI
      return {
        labels: Array.isArray(res?.labels) ? res.labels : [],
        userCounts: Array.isArray(res?.userCounts) ? res.userCounts : [],
        examCounts: Array.isArray(res?.examCounts) ? res.examCounts : [],
      };
    } catch (e) {
      // fallback : aucun data => le composant affichera "Aucune donnée"
      return { labels: [], userCounts: [], examCounts: [] };
    }
  }


  // Compte des caméras actives (si pas d’endpoint → 0)
  async getActiveCamerasCount(): Promise<{ count: number }> {
    try {
      const r = await this.requestJSON('/admin/cameras/active/count');
      if (typeof r === 'number') return { count: r };
      return { count: r?.count ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

  // Nombre d’alertes de sécurité (non résolues par défaut)
  async getSecurityAlertsCount(): Promise<{ count: number }> {
    try {
      const r = await this.requestJSON('/admin/security-logs?resolved=false');
      if (Array.isArray(r)) return { count: r.length };
      return { count: r?.count ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

  // Alertes récentes (si pas d’endpoint, tableau vide)
  async getRecentAlerts(limit = 10): Promise<any[]> {
    try {
      const q = this.buildQuery({ limit });
      const r = await this.requestJSON(`/admin/security-logs${q}`);
      return Array.isArray(r) ? r : (r?.items || []);
    } catch {
      return [];
    }
  }

  // Détails d’examens actifs (si pas d’endpoint, tableau vide)
  async getActiveExamsDetails(): Promise<any[]> {
    try {
      const r = await this.requestJSON('/admin/exams/active');
      return Array.isArray(r) ? r : (r?.items || []);
    } catch {
      return [];
    }
  }

  // Santé système (fallback sur /health)
  async getSystemHealth(): Promise<any> {
    try {
      return await this.requestJSON('/admin/health');
    } catch {
      // fallback sur le health public
      try {
        return await this.requestJSON('/health');
      } catch {
        return { status: 'UNKNOWN', timestamp: new Date().toISOString() };
      }
    }
  }

  async getSecurityLogs(params?: Record<string, any>) {
    const q = this.buildQuery(params);
    return this.requestJSON(`/admin/security-logs${q}`);
  }

  async resolveSecurityAlert(id: string) {
    return this.requestJSON(`/admin/security-logs/${id}/resolve`, {
      method: 'PATCH',
    });
  }

  async getSystemSettings() {
    return this.requestJSON('/admin/settings');
  }

  async updateSystemSettings(settings: any) {
    return this.requestJSON('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // ---------- Fallback générique ----------
  async fetch(endpoint: string, options: RequestInit = {}) {
    return this.requestJSON(endpoint, options);
  }
}

export const apiService = new ApiService();
