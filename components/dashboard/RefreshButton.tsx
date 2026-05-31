'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type State =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'cooldown'; remaining: number }
  | { kind: 'error'; message: string };

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  function startCooldown(seconds: number) {
    setState({ kind: 'cooldown', remaining: seconds });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.kind !== 'cooldown') return prev;
        const next = prev.remaining - 1;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          return { kind: 'idle' };
        }
        return { kind: 'cooldown', remaining: next };
      });
    }, 1000);
  }

  async function handleRefresh() {
    if (state.kind !== 'idle' && state.kind !== 'error') return;

    setState({ kind: 'syncing' });
    try {
      const response = await fetch('/api/sync/manual', { method: 'POST' });
      const result = await response.json();

      if (response.status === 429) {
        startCooldown(result.cooldownRemainingSeconds ?? 60);
        return;
      }
      if (!response.ok) {
        setState({ kind: 'error', message: result.error ?? 'Sync failed' });
        setTimeout(() => setState({ kind: 'idle' }), 4000);
        return;
      }

      router.refresh();
      startCooldown(60);
    } catch (e: any) {
      setState({ kind: 'error', message: e?.message ?? 'Network error' });
      setTimeout(() => setState({ kind: 'idle' }), 4000);
    }
  }

  const label =
    state.kind === 'syncing' ? 'Refreshing…'
    : state.kind === 'cooldown' ? `Ready in ${state.remaining}s`
    : state.kind === 'error' ? state.message
    : 'Refresh data';

  const disabled = state.kind === 'syncing' || state.kind === 'cooldown';

  return (
    <button
      onClick={handleRefresh}
      disabled={disabled}
      className={`
        text-xs uppercase tracking-[0.14em] font-medium
        px-4 py-2.5 border transition-all
        ${state.kind === 'error'
          ? 'border-accent-alert text-accent-alert'
          : 'border-ink text-ink hover:bg-ink hover:text-paper'
        }
        ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
      `}
    >
      {state.kind === 'syncing' && (
        <span className="inline-block w-3 h-3 mr-2 align-middle border-2 border-current border-r-transparent rounded-full animate-spin" />
      )}
      {label}
    </button>
  );
}
