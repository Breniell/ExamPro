// src/pages/admin/Users.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Search, Filter, UserCheck, UserX, Loader2 } from 'lucide-react';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student'|'teacher'|'admin';
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
};

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all'|'student'|'teacher'|'admin'>('all');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', role: 'student', password: '' });

  const load = async () => {
  setLoading(true);
  try {
    const params: any = {};
    if (filterRole !== 'all') params.role = filterRole;
    if (searchTerm.trim()) params.search = searchTerm.trim();
    const data = await apiService.getUsers(params);
    setUsers(data || []);
  } catch (e) {
    toast.error('Impossible de charger les utilisateurs.');
  } finally {
    setLoading(false);
  }
};


  useEffect(() => { load(); /* load on first */ }, []);
  // Reload quand les filtres changent (debounce simple)
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [searchTerm, filterRole]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createUser(formData);
      toast.success('Utilisateur créé');
      setShowCreateForm(false);
      setFormData({ firstName: '', lastName: '', email: '', role: 'student', password: '' });
      load();
    } catch (e:any) {
      toast.error(e?.message || 'Création impossible');
    }
  };

  const toggleUserStatus = async (u: User) => {
    try {
      await apiService.updateUser(u.id, { isActive: !u.isActive });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x));
      toast.success(u.isActive ? 'Utilisateur désactivé' : 'Utilisateur activé');
    } catch (e) {
      toast.error('Action impossible');
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      await apiService.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success('Utilisateur supprimé');
    } catch (e) {
      toast.error('Suppression impossible');
    }
  };

  const getRoleBadge = (role: string) =>
    role === 'admin' ? (
      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Admin</span>
    ) : role === 'teacher' ? (
      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">Enseignant</span>
    ) : (
      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Étudiant</span>
    );

  const getStatusBadge = (active: boolean) =>
    active ? (
      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Actif</span>
    ) : (
      <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">Inactif</span>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Utilisateurs</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" /> Nouvel utilisateur
        </button>
      </div>

      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Créer un utilisateur</h2>
            <form onSubmit={createUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Prénom
                  <input
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={formData.firstName}
                    onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Nom
                  <input
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={formData.lastName}
                    onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  type="email"
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Rôle
                <select
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.role}
                  onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}
                >
                  <option value="student">Étudiant</option>
                  <option value="teacher">Enseignant</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Mot de passe
                <input
                  type="password"
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  required
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 bg-gray-100 rounded-md">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher (nom / email)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as any)}
              className="border rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Tous les rôles</option>
              <option value="student">Étudiants</option>
              <option value="teacher">Enseignants</option>
              <option value="admin">Administrateurs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Utilisateurs ({users.length})</h2>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-gray-600">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Chargement...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateur</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dernière connexion</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(u.role)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(u.isActive)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleUserStatus(u)}
                          className={`${u.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                          title={u.isActive ? 'Désactiver' : 'Activer'}
                        >
                          {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                        <button className="text-indigo-600 hover:text-indigo-900" title="Éditer (à implémenter)">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteUser(u.id)} className="text-red-600 hover:text-red-900" title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                      Aucun utilisateur pour ces critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
