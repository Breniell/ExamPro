import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiBell,
  HiChat,
  HiChevronDown,
  HiOutlineUserCircle,
  HiMenu,
} from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import examproLogo from '../assets/exampro_logo_2.png';

type HeaderProps = {
  /** Ouvre/ferme la sidebar en mobile (facultatif). */
  onToggleSidebar?: () => void;
  /** Titre affiché à gauche (ex: ExamPro). */
  title?: string;
};

export default function Header({ onToggleSidebar, title = 'ExamPro' }: HeaderProps) {
  const { user, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(() => {
    const f = (user?.firstName || '').trim();
    const l = (user?.lastName || '').trim();
    return `${f ? f[0] : ''}${l ? l[0] : ''}`.toUpperCase() || 'U';
  }, [user?.firstName, user?.lastName]);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!openMenu) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openMenu]);

  return (
    <header className="bg-gradient-to-r from-indigo-800 to-indigo-700 text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
      {/* Left: burger (mobile) + logo + titre */}
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="inline-flex h-10 w-10 md:hidden items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="Ouvrir la navigation"
          >
            <HiMenu className="h-5 w-5" />
          </button>
        )}
        <span className="inline-flex items-center justify-center rounded-md bg-white px-1.5 py-1 ring-1 ring-black/10 shadow-sm">
          <img src={examproLogo} alt="ExamPro" className="h-7 w-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
        </span>
        <h1 className="text-lg md:text-xl font-semibold">{title}</h1>
      </div>

      {/* Right: actions (notifs, messages, user menu) */}
      <div className="flex items-center space-x-1 sm:space-x-2">
        <button
          title="Notifications"
          className="relative p-2 rounded-full hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Notifications"
        >
          <HiBell className="h-5 w-5" />
          {/* Exemple de badge (décommente si tu veux afficher un point) */}
          {/* <span className="absolute -top-0.5 -right-0.5 bg-pink-400 rounded-full h-2 w-2"></span> */}
        </button>

        <button
          title="Messages"
          className="relative p-2 rounded-full hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Messages"
        >
          <HiChat className="h-5 w-5" />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpenMenu((v) => !v)}
            className="flex items-center space-x-2 p-2 rounded-md hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-haspopup="menu"
            aria-expanded={openMenu}
          >
            {/* Avatar initiales si pas d'image */}
            <span
              className="inline-flex h-7 w-7 md:h-8 md:w-8 select-none items-center justify-center rounded-full bg-white/15 text-white text-sm md:text-base font-semibold"
              aria-hidden
            >
              {initials}
            </span>
            <span className="hidden sm:block truncate max-w-[120px]">
              {user?.firstName ?? 'Utilisateur'}
            </span>
            <HiChevronDown className={`h-4 w-4 transition-transform ${openMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Menu déroulant */}
          {openMenu && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-48 bg-white text-gray-700 rounded-md shadow-lg ring-1 ring-black/5 origin-top-right animate-[fadeIn_120ms_ease-out]"
            >
              <button
                role="menuitem"
                className="block w-full px-4 py-2 text-left hover:bg-gray-100 transition"
                onClick={() => {
                  setOpenMenu(false);
                  // TODO: route profil si tu en as une, ex: navigate('/profile')
                }}
              >
                Mon profil
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-2 text-left hover:bg-gray-100 transition"
                onClick={() => {
                  setOpenMenu(false);
                  // TODO: route paramètres si tu en as une, ex: navigate('/settings')
                }}
              >
                Paramètres
              </button>
              <div className="my-1 h-px bg-gray-100" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpenMenu(false);
                  logout();
                }}
                className="block w-full px-4 py-2 text-left hover:bg-gray-100 transition text-red-600"
              >
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
