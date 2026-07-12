import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold tracking-tight">ArenaHub</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Sports arena booking and management platform — owner and admin dashboards.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/health">Backend health</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Login</Link>
        </Button>
      </div>
    </main>
  );
}
