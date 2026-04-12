'use client';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

interface LiveSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function LiveSearch({ value, onChange, placeholder = 'Search…' }: LiveSearchProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local, onChange]);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
      />
    </div>
  );
}
