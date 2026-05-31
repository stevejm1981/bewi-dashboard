'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    router.push('/matrix');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="eyebrow block mb-2">Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-0 py-2.5 bg-transparent border-0 border-b border-line-strong focus:outline-none focus:border-ink text-sm tabular"
        />
      </div>

      <div>
        <label className="eyebrow block mb-2">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-0 py-2.5 bg-transparent border-0 border-b border-line-strong focus:outline-none focus:border-ink text-sm tabular"
        />
      </div>

      {error && (
        <p className="text-xs text-accent-alert tabular">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full mt-8 px-4 py-3.5 bg-ink text-paper text-xs uppercase tracking-[0.14em] font-medium hover:bg-ink-soft transition-colors disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
