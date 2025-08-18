import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import Spinner from '../../components/ui/Spinner';

type ExamItem = { id: string; title?: string; end_date?: string };

export default function TeacherCorrectionRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const qs = new URLSearchParams(location.search);
      const qId = qs.get('examId');

      // 1) Si ?examId= présent → normaliser l’URL
      if (qId) {
        navigate(`/teacher/correction/${qId}`, { replace: true });
        return;
      }

      try {
        // 2) Récupérer les examens du prof (le BE peut ignorer des filtres inconnus — pas grave)
        const resp = await apiService.getExams({
          mine: true,
          status: 'published',
          page: 1,
          pageSize: 50,
          sort: '-end_date',
        });
        const exams: ExamItem[] = Array.isArray(resp) ? resp : (resp?.items ?? []);

        if (!exams.length) {
          toast('Aucun examen trouvé. Créez-en un pour corriger des copies.');
          navigate('/teacher/exams', { replace: true });
          return;
        }

        // 3) Essayer de trouver le premier qui a des copies "submitted"
        for (const ex of exams) {
          try {
            const list = await apiService.getGradingSessions({
              examId: ex.id,
              status: 'submitted',
              page: 1,
              pageSize: 1, // on veut juste savoir s’il y en a
            });
            const items = Array.isArray(list) ? list : (list?.items ?? []);
            if (items.length > 0) {
              navigate(`/teacher/correction/${ex.id}`, { replace: true });
              return;
            }
          } catch {
            // on ignore et on continue sur l’exam suivant
          }
        }

        // 4) Fallback : le plus récent même s’il n’a pas (encore) de copies
        navigate(`/teacher/correction/${exams[0].id}`, { replace: true });
      } catch (e: any) {
        toast.error(e?.message || 'Impossible de déterminer un examen.');
        navigate('/teacher/exams', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [location.search, navigate]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
      <Spinner size={20} />
      <span className="ml-2">Ouverture de la page de correction…</span>
    </div>
  );
}
