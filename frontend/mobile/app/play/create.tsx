import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { useArenaCourts } from '@/hooks/useArenas';
import { ApiError } from '@/lib/api';
import { searchArenas } from '@/services/arenas';
import { createMatch } from '@/services/matches';
import type { Arena, Court } from '@/types';

const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

function nextDays(n: number): { date: string; label: string; dayNum: string }[] {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: String(d.getDate()),
    });
  }
  return days;
}

export default function CreateMatchScreen() {
  const days = useMemo(() => nextDays(14), []);

  const [arenaQuery, setArenaQuery] = useState('');
  const [arena, setArena] = useState<Arena | null>(null);
  const [court, setCourt] = useState<Court | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [date, setDate] = useState(days[0].date);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const arenaResults = useQuery({
    queryKey: ['play-arena-search', arenaQuery],
    queryFn: () => searchArenas({ q: arenaQuery.trim() || undefined, page_size: 10 }),
    enabled: !arena && arenaQuery.trim().length > 0,
  });

  const courts = useArenaCourts(arena?.id);

  const mutation = useMutation({
    mutationFn: () =>
      createMatch({
        arena_id: arena!.id,
        court_id: court!.id,
        sport: sport!,
        match_date: date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        max_players: maxPlayers,
      }),
    onSuccess: (match) =>
      router.replace({ pathname: '/play/[matchId]', params: { matchId: match.id } }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  const canSubmit = !!arena && !!court && !!sport && !!date && !!startTime && !!endTime && startTime < endTime;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Create a Match</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Arena</Text>
        {arena ? (
          <View style={styles.selectedRow}>
            <Text style={styles.selectedText}>
              {arena.name} · {arena.city}
            </Text>
            <Pressable
              onPress={() => {
                setArena(null);
                setCourt(null);
                setSport(null);
              }}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextField
              placeholder="Search for an arena"
              value={arenaQuery}
              onChangeText={setArenaQuery}
            />
            {arenaResults.isLoading ? <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 12 }} /> : null}
            {(arenaResults.data?.items ?? []).map((a) => (
              <Pressable key={a.id} style={styles.resultRow} onPress={() => setArena(a)}>
                <Text style={styles.resultName}>{a.name}</Text>
                <Text style={styles.resultMeta}>{a.city}</Text>
              </Pressable>
            ))}
          </>
        )}

        {arena ? (
          <>
            <Text style={styles.sectionTitle}>Court</Text>
            {courts.isLoading ? (
              <ActivityIndicator color={Colors.light.tint} />
            ) : (
              <View style={styles.chipRow}>
                {(courts.data ?? []).map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, court?.id === c.id && styles.chipActive]}
                    onPress={() => {
                      setCourt(c);
                      setSport(c.sport_types[0] ?? null);
                    }}>
                    <Text style={[styles.chipText, court?.id === c.id && styles.chipTextActive]}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : null}

        {court ? (
          <>
            <Text style={styles.sectionTitle}>Sport</Text>
            <View style={styles.chipRow}>
              {court.sport_types.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, sport === s && styles.chipActive]}
                  onPress={() => setSport(s)}>
                  <Text style={[styles.chipText, sport === s && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
              {days.map((d) => (
                <Pressable
                  key={d.date}
                  style={[styles.dateChip, date === d.date && styles.chipActive]}
                  onPress={() => setDate(d.date)}>
                  <Text style={[styles.dateChipDay, date === d.date && styles.chipTextActive]}>{d.label}</Text>
                  <Text style={[styles.dateChipNum, date === d.date && styles.chipTextActive]}>{d.dayNum}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Start Time</Text>
            <View style={styles.chipRow}>
              {HOURS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.chip, startTime === h && styles.chipActive]}
                  onPress={() => setStartTime(h)}>
                  <Text style={[styles.chipText, startTime === h && styles.chipTextActive]}>{h}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>End Time</Text>
            <View style={styles.chipRow}>
              {HOURS.map((h) => (
                <Pressable
                  key={h}
                  disabled={!!startTime && h <= startTime}
                  style={[
                    styles.chip,
                    endTime === h && styles.chipActive,
                    !!startTime && h <= startTime && styles.chipDisabled,
                  ]}
                  onPress={() => setEndTime(h)}>
                  <Text style={[styles.chipText, endTime === h && styles.chipTextActive]}>{h}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Max Players</Text>
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setMaxPlayers((n) => Math.max(2, n - 1))}>
                <Text style={styles.stepperBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{maxPlayers}</Text>
              <Pressable
                style={styles.stepperBtn}
                onPress={() => setMaxPlayers((n) => Math.min(50, n + 1))}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Create Match"
          loading={mutation.isPending}
          disabled={!canSubmit}
          onPress={() => {
            setError(null);
            mutation.mutate();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  content: { padding: 20, paddingBottom: 24, gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginTop: 16, marginBottom: 8 },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 12,
  },
  selectedText: { fontSize: 13, fontWeight: '600', color: Colors.light.text, flex: 1 },
  changeText: { fontSize: 12, fontWeight: '700', color: Colors.light.tint },
  resultRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  resultName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  resultMeta: { fontSize: 12, color: Colors.light.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, color: Colors.light.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  dateStrip: { gap: 8, paddingBottom: 4 },
  dateChip: {
    width: 52,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipDay: { fontSize: 11, color: Colors.light.muted },
  dateChipNum: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 18, color: Colors.light.text },
  stepperValue: { fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  errorText: { color: Colors.light.destructive, fontSize: 13, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
});
