'use client';
import { useState } from 'react';

interface ProfileCardProps {
  name: string;
  photoUrl?: string;
  idBadge?: string;
  subtitle?: string;
  details?: { label: string; value: string | React.ReactNode }[];
  children?: React.ReactNode;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileCard({ name, photoUrl, idBadge, subtitle, details = [], children }: ProfileCardProps) {
  const [imgError, setImgError] = useState(false);

  const showPhoto = photoUrl && !imgError;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="shrink-0">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={name}
              className="w-24 h-24 rounded-full object-cover border-4 border-[#16a34a]/20"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#16a34a] flex items-center justify-center border-4 border-[#16a34a]/20">
              <span className="text-3xl font-bold text-white">{getInitials(name)}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          {idBadge && (
            <span className="inline-block mt-1 px-3 py-0.5 bg-[#16a34a]/10 text-[#16a34a] text-xs font-semibold rounded-full">
              {idBadge}
            </span>
          )}
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}

          {details.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {details.map(({ label, value }, idx) => (
                <div key={idx}>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
