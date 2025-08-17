// src/pages/admin/Settings.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Save, Shield, Camera, Clock, Database, Mail, Loader2 } from 'lucide-react';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';

type SettingsShape = {
  maxFocusLoss: number;
  autoSubmitOnViolation: boolean;
  enableCameraMonitoring: boolean;
  requireCameraPermission: boolean;

  defaultExamDuration: number;
  allowLateSubmission: boolean;
  gracePerioMinutes: number;
  enableAutoSave: boolean;
  autoSaveInterval: number;

  alertThreshold: number;
  recordingSavedays: number;
  enableAudioRecording: boolean;
  motionDetectionSensitivity: 'low'|'medium'|'high';

  maxConcurrentExams: number;
  sessionTimeout: number;
  enableMaintenanceMode: boolean;

  emailNotifications: boolean;
  smsNotifications: boolean;
  alertAdminsOnViolation: boolean;
  notifyTeachersOnCompletion: boolean;
};

const DEFAULTS: SettingsShape = {
  maxFocusLoss: 3,
  autoSubmitOnViolation: true,
  enableCameraMonitoring: true,
  requireCameraPermission: true,

  defaultExamDuration: 120,
  allowLateSubmission: false,
  gracePerioMinutes: 5,
  enableAutoSave: true,
  autoSaveInterval: 30,

  alertThreshold: 2,
  recordingSavedays: 30,
  enableAudioRecording: false,
  motionDetectionSensitivity: 'medium',

  maxConcurrentExams: 50,
  sessionTimeout: 180,
  enableMaintenanceMode: false,

  emailNotifications: true,
  smsNotifications: false,
  alertAdminsOnViolation: true,
  notifyTeachersOnCompletion: true,
};

const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsShape>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiService.getSystemSettings(); // attend un objet { config?: {...} } ou l’objet direct
        const cfg = (s?.config && typeof s.config === 'object') ? s.config : s;
        setSettings(prev => ({ ...prev, ...(cfg || {}) }));
      } catch (e) {
        toast.error('Impossible de charger les paramètres.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handle = (key: keyof SettingsShape, value: any) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const resetToDefaults = () => setSettings(DEFAULTS);

  const save = async () => {
    setSaving(true);
    try {
      await apiService.updateSystemSettings(settings);
      toast.success('Paramètres sauvegardés ✅');
    } catch (e) {
      toast.error('Échec de la sauvegarde.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Chargement des paramètres...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Paramètres Système</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={resetToDefaults}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            disabled={saving}
          >
            Réinitialiser
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Sauvegarder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sécurité */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Shield className="h-5 w-5 mr-2 text-red-600" /> Paramètres de Sécurité
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre maximum de pertes de focus autorisées
              <input
                type="number" min={1} max={10}
                value={settings.maxFocusLoss}
                onChange={e => handle('maxFocusLoss', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            {[
              ['autoSubmitOnViolation', "Soumission auto en cas de violation"],
              ['requireCameraPermission', "Surveillance caméra obligatoire"],
              ['enableCameraMonitoring', "Activer la surveillance caméra"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <input
                  type="checkbox"
                  checked={(settings as any)[k]}
                  onChange={e => handle(k as keyof SettingsShape, e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Examen */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-blue-600" /> Paramètres d'Examen
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Durée par défaut des examens (minutes)
              <input
                type="number" min={30} max={300}
                value={settings.defaultExamDuration}
                onChange={e => handle('defaultExamDuration', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Période de grâce (minutes)
              <input
                type="number" min={0} max={30}
                value={settings.gracePerioMinutes}
                onChange={e => handle('gracePerioMinutes', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Autoriser soumissions tardives</span>
              <input
                type="checkbox"
                checked={settings.allowLateSubmission}
                onChange={e => handle('allowLateSubmission', e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Sauvegarde automatique</span>
              <input
                type="checkbox"
                checked={settings.enableAutoSave}
                onChange={e => handle('enableAutoSave', e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>

            {settings.enableAutoSave && (
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Intervalle de sauvegarde (secondes)
                <input
                  type="number" min={10} max={300}
                  value={settings.autoSaveInterval}
                  onChange={e => handle('autoSaveInterval', parseInt(e.target.value || '0', 10))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </label>
            )}
          </div>
        </div>

        {/* Surveillance */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Camera className="h-5 w-5 mr-2 text-purple-600" /> Paramètres de Surveillance
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seuil d'alerte (violations)
              <input
                type="number" min={1} max={10}
                value={settings.alertThreshold}
                onChange={e => handle('alertThreshold', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conservation enregistrements (jours)
              <input
                type="number" min={1} max={365}
                value={settings.recordingSavedays}
                onChange={e => handle('recordingSavedays', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sensibilité détection mouvement
              <select
                value={settings.motionDetectionSensitivity}
                onChange={e => handle('motionDetectionSensitivity', e.target.value as any)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
              </select>
            </label>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Enregistrement audio</span>
              <input
                type="checkbox"
                checked={settings.enableAudioRecording}
                onChange={e => handle('enableAudioRecording', e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Système */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Database className="h-5 w-5 mr-2 text-green-600" /> Paramètres Système
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Examens simultanés (max)
              <input
                type="number" min={1} max={200}
                value={settings.maxConcurrentExams}
                onChange={e => handle('maxConcurrentExams', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timeout session (minutes)
              <input
                type="number" min={30} max={480}
                value={settings.sessionTimeout}
                onChange={e => handle('sessionTimeout', parseInt(e.target.value || '0', 10))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Mode maintenance</span>
              <input
                type="checkbox"
                checked={settings.enableMaintenanceMode}
                onChange={e => handle('enableMaintenanceMode', e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Mail className="h-5 w-5 mr-2 text-orange-600" /> Paramètres de Notification
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            ['emailNotifications', 'Notifications par email'],
            ['smsNotifications', 'Notifications SMS'],
            ['alertAdminsOnViolation', 'Alerter les admins en cas de violation'],
            ['notifyTeachersOnCompletion', "Notifier les enseignants à la fin d'examen"],
          ].map(([k, label]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{label}</span>
              <input
                type="checkbox"
                checked={(settings as any)[k]}
                onChange={e => handle(k as keyof SettingsShape, e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
