import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Toast from './components/ui/Toast';
import Spinner from './components/ui/Spinner';
import TransitionWrapper from './components/animation/TransitionWrapper';

// AUTH PAGES
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import Unauthorized from './pages/Unauthorized';

// STUDENT
import StudentDashboard from './pages/student/Dashboard';
import StudentExam from './pages/student/Exam';
import StudentHistory from './pages/student/History';
import StudentExams from './pages/student/Exams';

// TEACHER
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherExams from './pages/teacher/Exams';
import TeacherCorrection from './pages/teacher/Correction';
import TeacherReports from './pages/teacher/Reports';

// ADMIN
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminSurveillance from './pages/admin/Surveillance';
import AdminSettings from './pages/admin/Settings';
import ProctorCenter from './pages/admin/ProctorCenter';

// Wrapper rôle + layout
const RoleProtectedLayout: React.FC<{ allowedRoles: string[] }> = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Layout><Outlet /></Layout>;
};

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to={`/${user.role}`} replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to={`/${user.role}`} replace />} />
      <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to={`/${user.role}`} replace />} />

      {/* Accès interdit */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Étudiant */}
      <Route element={<RoleProtectedLayout allowedRoles={['student']} />}>
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/exams" element={<StudentExams />} />
        <Route path="/student/exam/:id" element={<StudentExam />} />
        <Route path="/student/history" element={<StudentHistory />} />
      </Route>

      {/* Enseignant */}
      <Route element={<RoleProtectedLayout allowedRoles={['teacher']} />}>
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/exams" element={<TeacherExams />} />
        <Route path="/teacher/correction" element={<TeacherCorrection />} />
        <Route path="/teacher/correction/:examId" element={<TeacherCorrection />} />
        <Route path="/teacher/reports" element={<TeacherReports />} />
      </Route>

      {/* Administrateur */}
      <Route element={<RoleProtectedLayout allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/surveillance" element={<AdminSurveillance />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/proctor" element={<ProctorCenter />} />
      </Route>

      {/* Redirection selon statut */}
      <Route path="/" element={user ? <Navigate to={`/${user.role}`} replace /> : <Navigate to="/login" replace />} />

      {/* 404 */}
      <Route
        path="*"
        element={
          <TransitionWrapper>
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">Page non trouvée</h1>
                <p className="text-gray-600">La page que vous recherchez n’existe pas.</p>
              </div>
            </div>
          </TransitionWrapper>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Toast />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
