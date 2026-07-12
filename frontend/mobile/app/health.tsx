import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { API_BASE } from '@/lib/config';
import { fetchHealth, type HealthData } from '@/lib/api';

const DEPENDENCIES: { key: keyof HealthData; label: string }[] = [
  { key: 'api', label: 'API' },
  { key: 'database', label: 'PostgreSQL' },
  { key: 'redis', label: 'Redis' },
];

/**
 * Proves the mobile app can reach the FastAPI backend end-to-end:
 * env var -> typed API client -> TanStack Query -> screen.
 */
export default function HealthScreen() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Backend Health</ThemedText>
      <ThemedText style={styles.muted}>{API_BASE}/health</ThemedText>

      {isPending ? (
        <ThemedText>Checking…</ThemedText>
      ) : isError ? (
        <ThemedText style={styles.error}>
          Could not reach backend: {(error as Error).message}
        </ThemedText>
      ) : (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">
            {data.success ? '✅ Healthy' : '⚠️ Degraded'}
          </ThemedText>
          {DEPENDENCIES.map(({ key, label }) => {
            const status = data.data?.[key] ?? 'unknown';
            return (
              <ThemedView key={key} style={styles.row}>
                <ThemedText type="defaultSemiBold">{label}</ThemedText>
                <ThemedText style={status === 'ok' ? styles.ok : styles.error}>
                  {status}
                </ThemedText>
              </ThemedView>
            );
          })}
        </ThemedView>
      )}

      <Pressable style={styles.button} onPress={() => refetch()} disabled={isRefetching}>
        <ThemedText type="defaultSemiBold">
          {isRefetching ? 'Refreshing…' : 'Refresh'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  muted: { opacity: 0.6 },
  card: { gap: 12, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ok: { color: '#1a7f37' },
  error: { color: '#cf222e' },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
