import { Logo } from "@/components/brand/logo";

/** Shared two-column shell for every auth page (login, register, forgot/reset
 * password) — form on the left, branded arena photo on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-10 sm:px-14 lg:px-20">
        <div className="w-full max-w-sm">
          <Logo className="mb-8" />
          {children}
        </div>
      </div>

      <div
        className="relative hidden overflow-hidden bg-slate-950 lg:block"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.15) 40%, rgba(2,6,23,0.2) 100%), url('/images/login-arena.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-x-0 top-[62%] flex flex-col items-center px-14 text-center text-white">
          <h2 className="text-3xl font-bold">Manage. Grow. Thrive.</h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">
            All your arenas, bookings and analytics in one place.
          </p>
        </div>
      </div>
    </main>
  );
}
