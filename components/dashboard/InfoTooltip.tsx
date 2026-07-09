'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Small info affordance with a tooltip.
 * Hover shows it on desktop; tap toggles it on touch devices.
 * Reusable anywhere on the dashboard.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside tap (touch devices)
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More information"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] leading-none text-ink-subtle hover:text-ink transition-colors cursor-help"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full mt-2 z-50 w-60 rounded-md bg-white p-3 text-xs leading-relaxed text-ink-soft shadow-lg border border-line"
          style={{ backgroundColor: '#ffffff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
