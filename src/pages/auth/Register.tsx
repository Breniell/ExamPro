import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import TextInput from '../../components/ui/TextInput';
import PasswordInput from '../../components/ui/PasswordInput';
import Spinner from '../../components/ui/Spinner';
import AuthCard from '../../components/ui/AuthCard';
import TransitionWrapper from '../../components/animation/TransitionWrapper';
import examproLogo from '../assets/exampro_logo_2.png';

const Register: React.FC = () => {
  const { register, loading } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: 'student' as 'student' | 'teacher',
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    const success = await register(formData);
    if (!success) {
      setError("Erreur lors de l'inscription");
    }
  };

  return (
    <TransitionWrapper>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center gap-2 font-bold text-white/90 select-none">
          <span className="inline-flex items-center justify-center rounded-md bg-white px-1.5 py-1 ring-1 ring-black/10 shadow-sm">
            <img src={examproLogo} alt="ExamPro" className="h-7 w-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
          </span>
          <span className="text-lg tracking-wide">ExamPro</span>
        </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Créer un compte</h2>
          <p className="mt-2 text-sm text-gray-600">Rejoignez ExamPro</p>
        </div>

        <AuthCard>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <TextInput label="Prénom" name="firstName" value={formData.firstName} onChange={handleChange} required />
              <TextInput label="Nom" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>

            <TextInput label="Adresse email" name="email" type="email" value={formData.email} onChange={handleChange} required />

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Type de compte
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="student">Étudiant</option>
                <option value="teacher">Enseignant</option>
              </select>
            </div>

            <PasswordInput label="Mot de passe" name="password" value={formData.password} onChange={handleChange} required />
            <PasswordInput label="Confirmer le mot de passe" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required />

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? <Spinner /> : 'Créer le compte'}
            </button>

            <p className="text-center text-sm text-gray-600">
              Déjà un compte ?{' '}
              <Link to="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                Se connecter
              </Link>
            </p>
          </form>
        </AuthCard>
      </div>
    </TransitionWrapper>
  );
};

export default Register;
