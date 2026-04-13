'use client';

import { cn } from '@/lib/utils';

type UserTypeToggleProps = {
  value: 'issuer' | 'business';
  onChange: (value: 'issuer' | 'business') => void;
};

export function UserTypeToggle({ value, onChange }: UserTypeToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
      <button
        type="button"
        onClick={() => onChange('issuer')}
        className={cn(
          'rounded-md px-4 py-2.5 text-sm font-medium transition-all',
          value === 'issuer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Issuer
      </button>
      <button
        type="button"
        onClick={() => onChange('business')}
        className={cn(
          'rounded-md px-4 py-2.5 text-sm font-medium transition-all',
          value === 'business' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Business
      </button>
    </div>
  );
}
