// src/pages/admin/Users.tsx
import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Search, Filter, UserCheck, UserX, Loader2 } from 'lucide-react';
import { apiService } from '../../services/api';
import { toast } from 'react-hot-toast';

// --- Types ---
type Role = 'student' | 'teacher' | 'admin';
type FilterRole = 'all' | Role;

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
};

type CreateUserForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  password: string;
};

type EditUserForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  password: string; // vide si pas de changement
};

function normalizeUserRow(r: any): User {
  return {
    id: r.id ?? r.user_id ?? r.uuid ?? '',
    firstName: r.firstName ?? r.first_name ?? r.firstname ?? '',
    lastName: r.lastName ?? r.last_name ?? r.lastname ?? '',
    email: r.email ?? '',
    role: (r.role ?? 'student') as Role,
    isActive: (r.isActive ?? r.is_active ?? true) as boolean,
    lastLogin: r.lastLogin ?? r.last_login ?? null,
    createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
  };
}

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreateUserForm>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'student',
    password: '',
  });

  const [showEditForm, setShowEditForm] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editData, setEditData] = useState<EditUserForm>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'student',
    password: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterRole !== 'all') params.role = filterRole;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const data = await apiService.getUsers(params);

      const rows: any[] =
        Array.isArray(data) ? data
        : Array.isArray((data as any)?.items) ? (data as any).items
        : Array.isArray((data as any)?.users) ? (data as any).users
        : [];

      setUsers(rows.map(normalizeUserRow));
    } catch (e) {
      toast.error('Impossible de charger les utilisateurs.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [searchTerm, filterRole]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createUser({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        role: formData.role, // <-- maintenant typé Role
        password: formData.password,
      });
      toast.success('Utilisateur créé');
      setShowCreateForm(false);
      setFormData({ firstName: '', lastName: '', email: '', role: 'student', password: '' });
      load();
    } catch (e:any) {
      toast.error(e?.message || 'Création impossible');
    }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditData({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      password: '',
    });
    setShowEditForm(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    const patch: any = {};
    if (editData.firstName !== editTarget.firstName) patch.firstName = editData.firstName;
    if (editData.lastName !== editTarget.lastName) patch.lastName = editData.lastName;
    if (editData.email !== editTarget.email) patch.email = editData.email;
    if (editData.role !== editTarget.role) patch.role = editData.role;
    if (editData.password.trim()) patch.password = editData.password.trim();

    try {
      await apiService.updateUser(editTarget.id, patch);
      setUsers(prev => prev.map(x => x.id === editTarget.id ? normalizeUserRow({ ...x, ...patch }) : x));
      toast.success('Utilisateur mis à jour');
      setShowEditForm(false);
      setEditTarget(null);
    } catch (e:any) {
      toast.error(e?.message || 'Mise à jour impossible');
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

  const getRoleBadge = (role: Role) =>
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
                  onChange={e => setFormData(p => ({ ...p, role: e.target.value as Role }))} // <-- cast ici
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

      {/* Edit Modal */}
      {showEditForm && editTarget && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Modifier l’utilisateur</h2>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Prénom
                  <input
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={editData.firstName}
                    onChange={e => setEditData(p => ({ ...p, firstName: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Nom
                  <input
                    className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    value={editData.lastName}
                    onChange={e => setEditData(p => ({ ...p, lastName: e.target.value }))}
                    required
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  type="email"
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={editData.email}
                  onChange={e => setEditData(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Rôle
                <select
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={editData.role}
                  onChange={e => setEditData(p => ({ ...p, role: e.target.value as Role }))} // <-- cast ici
                >
                  <option value="student">Étudiant</option>
                  <option value="teacher">Enseignant</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Nouveau mot de passe (optionnel)
                <input
                  type="password"
                  placeholder="Laisser vide pour ne pas changer"
                  className="mt-1 w-full px-3 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={editData.password}
                  onChange={e => setEditData(p => ({ ...p, password: e.target.value }))}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowEditForm(false); setEditTarget(null); }} className="px-4 py-2 bg-gray-100 rounded-md">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                  Enregistrer
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
              onChange={e => setFilterRole(e.target.value as FilterRole)}  // <-- cast ici
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
                        <button
                          onClick={() => openEdit(u)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Éditer"
                        >
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
