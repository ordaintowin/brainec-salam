'use client';
import { useState } from 'react';
import { X } from 'lucide-react';

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
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const showPhoto = photoUrl && !imgError;

  return (
    <>
      {/* Lightbox overlay */}
      {lightboxOpen && showPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-gray-600 hover:text-gray-900"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={name}
              className="w-full rounded-xl object-contain max-h-[80vh] shadow-2xl"
            />
            <p className="text-center text-white text-sm mt-3 font-medium">{name}</p>
          </div>
        </div>
      )}

    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="shrink-0">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={name}
              className="w-36 h-36 rounded-full object-cover border-4 border-[#16a34a]/20 cursor-pointer hover:opacity-90 transition-opacity"
              onError={() => setImgError(true)}
              onClick={() => setLightboxOpen(true)}
              title="Click to enlarge"
            />
          ) : (
            <div className="w-36 h-36 rounded-full bg-[#16a34a] flex items-center justify-center border-4 border-[#16a34a]/20">
              <span className="text-4xl font-bold text-white">{getInitials(name)}</span>
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
    </>
  );
}
