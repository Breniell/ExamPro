import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartData,
  ChartOptions,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { apiService } from '../../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type StatsPayload = {
  labels: string[];
  userCounts: number[];
  examCounts: number[];
};

const AdminChart: React.FC = () => {
  const [dataPayload, setDataPayload] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stats = await apiService.getAdminChartStats(); // endpoint backend => /api/admin/charts/overview
        setDataPayload(stats);
      } catch (e) {
        console.error('Erreur chargement graphiques admin:', e);
        setDataPayload({ labels: [], userCounts: [], examCounts: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-center text-gray-500">Chargement des graphiques...</div>;
  if (!dataPayload || dataPayload.labels.length === 0)
    return <div className="bg-white p-6 rounded-lg shadow">Aucune donnée à afficher.</div>;

  const data: ChartData<'bar' | 'line', number[], string> = {
    labels: dataPayload.labels,
    datasets: [
      {
        type: 'bar',
        label: 'Utilisateurs inscrits',
        data: dataPayload.userCounts,
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        yAxisID: 'y',
      },
      {
        type: 'line',
        label: 'Examens créés',
        data: dataPayload.examCounts,
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.3)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y',
      },
    ],
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: 'Évolution mensuelle des utilisateurs et examens',
        font: { size: 16 },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
      },
    },
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow w-full" style={{ minHeight: 360 }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
};

export default AdminChart;
