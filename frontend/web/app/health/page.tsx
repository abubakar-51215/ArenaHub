"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE } from "@/config";
import { fetchHealth, type HealthData } from "@/services/api";

const DEPENDENCIES: { key: keyof HealthData; label: string }[] = [
  { key: "api", label: "API" },
  { key: "database", label: "PostgreSQL" },
  { key: "redis", label: "Redis" },
];

/**
 * Proves the web app can reach the FastAPI backend end-to-end:
 * env var -> typed API client -> TanStack Query -> page.
 */
export default function HealthPage() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Backend Health</CardTitle>
          <CardDescription>{API_BASE}/health</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isPending ? (
            <p className="text-muted-foreground">Checking…</p>
          ) : isError ? (
            <p className="text-destructive">Could not reach backend: {(error as Error).message}</p>
          ) : (
            <>
              <Badge variant={data.success ? "default" : "destructive"}>
                {data.success ? "Healthy" : "Degraded"}
              </Badge>
              <ul className="flex flex-col gap-2">
                {DEPENDENCIES.map(({ key, label }) => {
                  const status = data.data?.[key] ?? "unknown";
                  return (
                    <li key={key} className="flex items-center justify-between">
                      <span className="font-medium">{label}</span>
                      <span className={status === "ok" ? "text-green-600" : "text-destructive"}>
                        {status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <Button
            variant="outline"
            className="self-start"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? "Refreshing…" : "Refresh"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
