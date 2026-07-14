import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

// Full booking summary/payment flow lands in the next phase — this stub just
// confirms the slot-selection -> booking handoff (courtId + slotIds params)
// wires up correctly.
export default function BookingSummaryScreen() {
  const { courtId, slotIds } = useLocalSearchParams<{ courtId: string; slotIds: string }>();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Booking Summary</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Court {courtId}, slot {slotIds} — checkout flow lands next.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.light.text, padding: 20 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholderText: { color: Colors.light.muted, textAlign: 'center' },
});
