import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TransitionWrapper from '../../components/animation/TransitionWrapper';
import Spinner from '../../components/ui/Spinner';
import PasswordInput from '../../components/ui/PasswordInput';
import TextInput from '../../components/ui/TextInput';
import AuthCard from '../../components/ui/AuthCard';
import examproLogo from '../../assets/exampro_logo_2.png';

const Login: React.FC = () => {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = await login(email, password);
    if (!success) {
      setError('Identifiants incorrects');
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
          <p className="mt-2 text-sm text-gray-600">Connexion à votre espace sécurisé</p>
        </div>

        <AuthCard>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <TextInput
              label="Adresse email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="votre@email.com"
            />

            <PasswordInput
              label="Mot de passe"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex items-center justify-between">
              <Link to="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-500">
                Mot de passe oublié ?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? <Spinner /> : 'Se connecter'}
            </button>

            <p className="text-sm text-center text-gray-600">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-indigo-600 hover:text-indigo-500 font-medium">
                S’inscrire
              </Link>
            </p>
          </form>
        </AuthCard>
      </div>
    </TransitionWrapper>
  );
};

export default Login;
