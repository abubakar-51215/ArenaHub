import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/auth';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {user?.full_name?.split(' ')[0] ?? 'there'} 👋</Text>
        <Text style={styles.subtitle}>Find your arena, book and play!</Text>
      </View>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Arena browsing lands next — check back soon.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholderText: { color: Colors.light.muted, textAlign: 'center' },
});
