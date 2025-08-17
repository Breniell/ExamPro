import { NavLink } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { navItemsByRole, NavItem } from '../types/nav';
import {
  HiViewGrid,
  HiClipboardList,
  HiAcademicCap,
  HiUserGroup,
  HiCog,
  HiVideoCamera,
  HiDocumentReport,
  HiCheckCircle,
  HiCollection,
  HiX
} from 'react-icons/hi';
import examproLogo from '../assets/exampro_logo_2.png';

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

const iconMap: Record<string, JSX.Element> = {
  dashboard:    <HiViewGrid className="h-5 w-5 shrink-0" />,
  users:        <HiUserGroup className="h-5 w-5 shrink-0" />,
  exams:        <HiClipboardList className="h-5 w-5 shrink-0" />,
  questions:    <HiAcademicCap className="h-5 w-5 shrink-0" />,
  correction:   <HiCheckCircle className="h-5 w-5 shrink-0" />,
  reports:      <HiDocumentReport className="h-5 w-5 shrink-0" />,
  history:      <HiCollection className="h-5 w-5 shrink-0" />,
  surveillance: <HiVideoCamera className="h-5 w-5 shrink-0" />,
  settings:     <HiCog className="h-5 w-5 shrink-0" />
};

function NavItemRow({ name, label, path }: NavItem) {
  const Icon = iconMap[name] ?? <HiViewGrid className="h-5 w-5 shrink-0" />;

  const base =
    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition ' +
    'focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-900';

  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        isActive
          ? `${base} bg-white/10 text-white`
          : `${base} text-indigo-100 hover:bg-white/5 hover:text-white`
      }
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          {/* Barre active à gauche */}
          <span
            className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-white/80 transition ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span className="text-white/90">{Icon}</span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const items = useMemo<NavItem[]>(() => (user ? navItemsByRole[user.role] ?? [] : []), [user]);
  if (!user) return null;

  const inner = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 font-bold text-white/90 select-none">
          <span className="inline-flex items-center justify-center rounded-md bg-white px-1.5 py-1 ring-1 ring-black/10 shadow-sm">
            <img src={examproLogo} alt="ExamPro" className="h-7 w-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
          </span>
          <span className="text-lg tracking-wide">ExamPro</span>
        </div>

        <button
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70"
          onClick={onClose}
          aria-label="Fermer la navigation"
        >
          <HiX className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="mt-2 space-y-1 px-3 pb-4">
        {items.map((it) => (
          <NavItemRow key={it.path} {...it} />
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto border-t border-white/10 px-4 py-3 text-xs text-indigo-100/80">
        <div>
          Connecté :{' '}
          <span className="font-medium text-white/90">
            {user.firstName} {user.lastName}
          </span>
        </div>
        <div className="opacity-80">Rôle : {user.role}</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!mobileOpen}
      />

      {/* Drawer mobile + sidebar desktop */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-indigo-900 to-indigo-800 text-gray-200 shadow-2xl transition-transform',
          'md:static md:z-auto md:block md:w-64 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        ].join(' ')}
        role="navigation"
        aria-label="Navigation principale"
      >
        {inner}
      </aside>
    </>
  );
}
