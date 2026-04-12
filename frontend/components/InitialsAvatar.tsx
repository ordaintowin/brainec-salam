'use client';

function hashColor(name: string): string {
  const colors = [
    '#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2',
    '#be185d', '#0284c7', '#65a30d', '#d97706', '#dc2626',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface InitialsAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function InitialsAvatar({ name, size = 'md', className = '' }: InitialsAvatarProps) {
  const bg = hashColor(name);
  const initials = getInitials(name || '?');

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0 ${className}`}
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}
