import React from 'react';

interface BrandCreditProps {
  className?: string;
  compact?: boolean;
  light?: boolean;
}

export const BrandCredit: React.FC<BrandCreditProps> = ({ className = '', compact = false, light = false }) => (
  <div className={`flex items-center justify-center gap-2 ${className}`}>
    <img
      src="/balajione-logo.png"
      alt="BalajiOne Enterprises logo"
      className={`${compact ? 'h-7 w-7' : 'h-9 w-9'} rounded-lg bg-white object-contain p-0.5 shadow-sm`}
    />
    <div className="min-w-0 text-left leading-tight">
      <span className={`block text-[8px] font-semibold uppercase tracking-[0.15em] ${light ? 'text-slate-500' : 'text-slate-400'}`}>
        Developed by
      </span>
      <strong className={`block truncate ${compact ? 'text-[10px]' : 'text-xs'} ${light ? 'text-slate-700' : 'text-slate-200'}`}>
        BalajiOne Enterprises
      </strong>
    </div>
  </div>
);
