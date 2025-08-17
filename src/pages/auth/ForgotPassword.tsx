import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../../components/ui/Spinner';
import TextInput from '../../components/ui/TextInput';
import AuthCard from '../../components/ui/AuthCard';
import TransitionWrapper from '../../components/animation/TransitionWrapper';

const ForgotPassword: React.FC = () => {
  const { resetPassword, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const success = await resetPassword(email);
    if (success) {
      setIsSubmitted(true);
    } else {
      setError("Aucun compte trouvé avec cette adresse email");
    }
  };

  return (
    <TransitionWrapper>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Mot de passe oublié</h2>
          <p className="mt-2 text-sm text-gray-600">
            Entrez votre email pour recevoir un lien de réinitialisation
          </p>
        </div>

        <AuthCard>
          {isSubmitted ? (
            <div className="text-center space-y-4">
              <div className="bg-green-100 p-4 rounded-md">
                <p className="text-green-800">
                  Un email de réinitialisation a été envoyé à <strong>{email}</strong>
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Cliquez sur le lien dans l'email pour réinitialiser votre mot de passe.
              </p>
              <Link to="/login" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-500 font-medium">
                <ArrowLeft className="h-4 w-4" />
                Retour à la connexion
              </Link>
            </div>
          ) : (
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

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? <Spinner /> : 'Envoyer le lien de réinitialisation'}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-500 font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </AuthCard>
      </div>
    </TransitionWrapper>
  );
};

export default ForgotPassword;
