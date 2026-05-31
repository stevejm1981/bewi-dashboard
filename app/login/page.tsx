import { LoginForm } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left - editorial type block */}
      <div className="hidden md:flex md:w-1/2 bg-ink text-paper p-16 items-end relative overflow-hidden">
        <div className="absolute top-16 left-16 eyebrow text-paper/60">BEWI &middot; Howden &middot; S03</div>
        <div className="relative z-10">
          <h1 className="headline text-7xl leading-[0.95] tracking-tightest">
            Volume.
            <br />
            <em className="not-italic font-medium text-paper/70">Demand.</em>
            <br />
            Capacity.
          </h1>
          <p className="mt-8 text-sm text-paper/60 max-w-sm leading-relaxed">
            Operational visibility for the Howden warehouse. Open sales, in-progress works orders, and shipment volume in m³ - reconciled to source.
          </p>
        </div>
        <div className="absolute bottom-16 left-16 text-xs text-paper/40 eyebrow">
          Prepared by SupplyLens
        </div>
      </div>

      {/* Right - login */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden eyebrow mb-2">BEWI &middot; Howden</div>
          <h2 className="headline text-3xl mb-1">Sign in</h2>
          <p className="text-sm text-ink-muted mb-8">Use your nominated account.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
