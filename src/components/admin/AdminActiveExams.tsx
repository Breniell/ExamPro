import React from 'react';
import { Clock } from 'lucide-react';

type ActiveExam = {
  id: string;
  title: string;
  teacher: string;
  start_date: string;        // ISO
  duration_minutes: number;
  students_count: number;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function computeProgress(startISO: string, durationMin: number) {
  const start = new Date(startISO).getTime();
  const end = start + durationMin * 60 * 1000;
  const now = Date.now();
  const ratio = (now - start) / (end - start);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function AdminActiveExams({ exams }: { exams: ActiveExam[] }) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Clock className="h-5 w-5 mr-2 text-indigo-600" />
          Examens en Cours
        </h2>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {exams.map((exam) => {
          const progress = computeProgress(exam.start_date, exam.duration_minutes);
          return (
            <div key={exam.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">{exam.title}</h3>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                  En cours
                </span>
              </div>
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>Enseignant:</span>
                  <span className="font-medium">{exam.teacher}</span>
                </div>
                <div className="flex justify-between">
                  <span>Étudiants:</span>
                  <span className="font-medium">{exam.students_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Début:</span>
                  <span className="font-medium">{formatTime(exam.start_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Durée:</span>
                  <span className="font-medium">{exam.duration_minutes} min</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progression</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
