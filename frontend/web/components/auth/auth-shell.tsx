import { Logo } from "@/components/brand/logo";

/** Shared two-column shell for every auth page (login, register, forgot/reset
 * password) — form on the left, branded arena photo on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center bg-brand-gradient-soft px-6 py-10 sm:px-14 lg:bg-none lg:px-20">
        <div className="animate-fade-in-up w-full max-w-sm">
          <Logo className="mb-8" />
          {children}
        </div>
      </div>

      <div
        className="relative hidden overflow-hidden bg-slate-950 lg:block"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(2,6,23,0.92) 0%, rgba(37,99,235,0.25) 45%, rgba(2,6,23,0.25) 100%), url('/images/login-arena.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Soft brand glow to tie the photo to the palette */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 -left-20 size-64 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="animate-fade-in-up absolute inset-x-0 top-[60%] flex flex-col items-center px-14 text-center text-white [animation-delay:0.15s]">
          <h2 className="text-3xl font-bold tracking-tight">Manage. Grow. Thrive.</h2>
          <p className="mt-2 max-w-sm text-sm text-white/75">
            All your arenas, bookings and analytics in one place.
          </p>
        </div>
      </div>
    </main>
  );
}
