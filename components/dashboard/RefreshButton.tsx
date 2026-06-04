'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'info' | 'success' | 'error'>('info');

  // Clear messages after 5 seconds
  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(id);
    }
  }, [message]);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/sync/manual', { method: 'POST' });
      const data = await res.json();

      if (res.status === 429) {
        // Cooldown: someone refreshed recently
        setMessageTone('info');
        setMessage('Just refreshed — please wait a moment before refreshing again.');
      } else if (res.status === 409 || data?.error?.toLowerCase().includes('in progress')) {
        // Sync currently running
        setMessageTone('info');
        setMessage('An automatic refresh is currently underway. Your data will update in a few seconds.');
      } else if (!res.ok) {
        setMessageTone('error');
        setMessage('Refresh failed. Please try again or contact support if it keeps happening.');
      } else {
        setMessageTone('success');
        setMessage('Refresh complete — latest data now loaded.');
        router.refresh();
      }
    } catch (e) {
      setMessageTone('error');
      setMessage('Refresh failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const toneClass =
    messageTone === 'success' ? 'text-accent-ok'
    : messageTone === 'error' ? 'text-accent-alert'
    : 'text-ink-muted';

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs tabular max-w-xs ${toneClass}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="px-5 py-2 border border-ink text-ink text-xs uppercase tracking-[0.16em] font-medium hover:bg-ink hover:text-paper transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Refreshing...' : 'Refresh Data'}
      </button>
    </div>
  );
}
