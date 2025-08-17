// src/types/nav.ts
// Définition des éléments de navigation pour chaque rôle.
// Chaque entrée contient un « name » (clé utilisée pour associer une icône),
// un libellé à afficher et le chemin correspondant dans l'application.

export interface NavItem {
  /**
   * Clé symbolique pour l'icône. Correspond à une entrée dans un dictionnaire
   * d'icônes (voir Sidebar.tsx).
   */
  name: string;
  /** Libellé affiché dans la barre latérale */
  label: string;
  /** Chemin de navigation pour React Router */
  path: string;
}

/**
 * Liste des éléments de navigation selon le rôle de l'utilisateur.
 * Le rôle est la clé principale et retourne un tableau d'objets NavItem.
 */
export const navItemsByRole: Record<string, NavItem[]> = {
  admin: [
    { name: 'dashboard',    label: 'Dashboard',    path: '/admin' },
    { name: 'users',        label: 'Utilisateurs', path: '/admin/users' },
    { name: 'surveillance', label: 'Surveillance', path: '/admin/surveillance' },
    { name: 'settings',     label: 'Paramètres',   path: '/admin/settings' }
  ],
  teacher: [
    { name: 'dashboard',  label: 'Dashboard',  path: '/teacher' },
    { name: 'exams',      label: 'Examens',    path: '/teacher/exams' },
    { name: 'correction', label: 'Correction', path: '/teacher/correction' },
    { name: 'reports',    label: 'Rapports',   path: '/teacher/reports' }
  ],
  student: [
    { name: 'dashboard', label: 'Dashboard', path: '/student' },
    { name: 'exams',     label: 'Examens',   path: '/student/exams' },
    { name: 'history',   label: 'Historique', path: '/student/history' }
  ]
};
