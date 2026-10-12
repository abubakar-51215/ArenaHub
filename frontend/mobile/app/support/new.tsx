import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/g6/form-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { COMPLAINT_CATEGORIES } from '@/constants/support';
import { ApiError } from '@/lib/api';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { MAX_COMPLAINT, submitComplaint, type ComplaintCategory } from '@/services/complaints';

// New complaint, from arena-hub-player-app-account.html (frame 29): what it is about (one of six), what happened (up to 2000
// characters), Send complaint. Attaching a booking is for later.
export default function NewComplaintScreen() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => submitComplaint(category as ComplaintCategory, text.trim()),
    onSuccess: () => {
      successHaptic();
      qc.invalidateQueries({ queryKey: ['my-complaints'] });
      showToast('Complaint sent');
      router.back();
    },
    onError: (err) => {
      errorHaptic();
      setError(err instanceof ApiError ? err.message : 'Could not send your complaint. Please try again.');
    },
  });

  const submit = () => {
    if (send.isPending) return;
    if (!category) return setError('Choose what it is about.');
    if (text.trim().length < 5) return setError('Tell us what happened.');
    setError(null);
    send.mutate();
  };

  return (
    <FormScreen title="New complaint" footer={<Button title="Send complaint" offlineLabel="Send needs a connection" loading={send.isPending} disabled={!category || text.trim().length < 5} onPress={submit} />}>
      <Text style={styles.label} accessibilityRole="header">
        What is it about?
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {COMPLAINT_CATEGORIES.map((c) => {
          const on = c.value === category;
          return (
            <Pressable
              key={c.value}
              onPress={() => {
                tapHaptic();
                setCategory(c.value);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && { color: Colors.light.lime }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label} accessibilityRole="header">
        Tell us what happened
      </Text>
      <TextField
        kind="multiline"
        placeholder="Write what happened. The more you tell us, the faster we can help."
        value={text}
        onChangeText={(t) => {
          setText(t.slice(0, MAX_COMPLAINT));
          setError(null);
        }}
        maxLength={MAX_COMPLAINT}
        accessibilityLabel="What happened"
        error={error}
      />
      <Text style={styles.counter}>
        {text.length} / {MAX_COMPLAINT}
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.light.card, borderWidth: 1.5, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  counter: { fontSize: 14, color: Colors.light.muted, textAlign: 'right' },
});
