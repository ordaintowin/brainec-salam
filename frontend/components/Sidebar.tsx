'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  ClipboardList,
  Archive,
  ScrollText,
  ShieldCheck,
  LogOut,
  School,
  CalendarRange,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import InitialsAvatar from './InitialsAvatar';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
}

const roleLabelMap: Record<string, string> = {
  HEADMISTRESS: 'Admin Head',
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
};

const formatRoleFallback = (role: string) => role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'Students', href: '/dashboard/students', icon: <Users className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Teachers', href: '/dashboard/teachers', icon: <GraduationCap className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Classes', href: '/dashboard/classes', icon: <BookOpen className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Finance', href: '/dashboard/finance', icon: <DollarSign className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Attendance', href: '/dashboard/attendance', icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'Terms', href: '/dashboard/terms', icon: <CalendarRange className="w-5 h-5" />, roles: ['HEADMISTRESS'] },
  { label: 'Archive', href: '/dashboard/archive', icon: <Archive className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Activity Logs', href: '/dashboard/logs', icon: <ScrollText className="w-5 h-5" />, roles: ['HEADMISTRESS', 'ADMIN'] },
  { label: 'Admins', href: '/dashboard/admins', icon: <ShieldCheck className="w-5 h-5" />, roles: ['HEADMISTRESS'] },
];

const teacherNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'My Class', href: '/dashboard/classes', icon: <BookOpen className="w-5 h-5" /> },
  { label: 'Attendance', href: '/dashboard/attendance', icon: <ClipboardList className="w-5 h-5" /> },
];

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ className = '', onNavigate, showCloseButton = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const items = user?.role === 'TEACHER' ? teacherNavItems : navItems.filter(item =>
    !item.roles || item.roles.includes(user?.role || '')
  );

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className={`w-64 bg-[#16a34a] flex flex-col h-full shrink-0 ${className}`}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-green-600">
        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shrink-0">
          <School className="w-5 h-5 text-[#16a34a]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm leading-tight">Brainec Salam</p>
          <p className="text-green-200 text-xs">School Management</p>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white hover:bg-green-600"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-white text-[#16a34a]'
                    : 'text-white hover:bg-green-600'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-green-600">
        <div className="flex items-center gap-3 px-2 mb-3">
          <InitialsAvatar name={user?.name || 'User'} size="sm" />
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-green-200 text-xs">{user?.role ? roleLabelMap[user.role] || formatRoleFallback(user.role) : ''}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-white hover:bg-green-600 rounded-lg text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
