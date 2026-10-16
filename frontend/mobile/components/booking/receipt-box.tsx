import { Pressable, StyleSheet, View } from 'react-native';

import { IconTile, UploadIcon } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { IconExtra } from '@/components/ui/icon-extra';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/**
 * "Your receipt" on the Bank transfer screen, in every state of arena-hub-player-app-states.html (frames 05 to 09):
 * nothing chosen, ready, uploading with a percentage and Cancel, stopped, failed (Try again, Choose another) and a photo that
 * is too big or the wrong type. The screen owns the state; this only draws it.
 */
export type ReceiptState =
  | { kind: 'empty' }
  | { kind: 'ready'; name: string }
  | { kind: 'uploading'; name: string; pct: number }
  | { kind: 'stopped' }
  | { kind: 'failed'; name: string; message: string }
  | { kind: 'bad'; title: string; text: string };

export function ReceiptBox({
  state,
  onChoose,
  onCancel,
  onRetry,
}: {
  state: ReceiptState;
  onChoose: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (state.kind === 'uploading') {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <View style={styles.thumb}>
            <IconExtra name="camera" size={22} color={Colors.light.text2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {state.name}
            </Text>
            <Text style={styles.sub}>Uploading… {state.pct}%</Text>
          </View>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel the upload" style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: state.pct }}>
          <View style={[styles.fill, { width: `${state.pct}%` }]} />
        </View>
      </View>
    );
  }
  if (state.kind === 'failed') {
    return (
      <View style={[styles.card, styles.cardRed]} accessibilityRole="alert">
        <View style={styles.row}>
          <View style={styles.thumb}>
            <IconExtra name="camera" size={22} color={Colors.light.text2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {state.name}
            </Text>
            <Text style={styles.redText}>{state.message}</Text>
          </View>
        </View>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Button title="Try again" onPress={onRetry} offlineLabel="Needs a connection" />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Choose another" variant="ghost" onPress={onChoose} />
          </View>
        </View>
      </View>
    );
  }
  if (state.kind === 'bad') {
    return (
      <View style={{ gap: 10 }}>
        <View style={[styles.drop, styles.dropRed]} accessibilityRole="alert">
          <Text style={styles.dropTitle}>{state.title}</Text>
          <Text style={styles.dropText}>{state.text}</Text>
        </View>
        <Button title="Choose another photo" variant="ghost" onPress={onChoose} />
      </View>
    );
  }
  if (state.kind === 'stopped') {
    return (
      <View style={{ gap: 10 }}>
        <View style={styles.drop}>
          <View style={{ marginBottom: 8 }}>
            <IconTile tone="lime">
              <IconExtra name="camera" size={18} color={Colors.light.limeDeep} />
            </IconTile>
          </View>
          <Text style={styles.dropTitle}>Upload stopped</Text>
          <Text style={styles.dropText}>Choose a photo of your receipt (JPG or PNG, up to 5 MB).</Text>
        </View>
        <Button title="Choose photo" variant="ghost" onPress={onChoose} />
      </View>
    );
  }
  const ready = state.kind === 'ready';
  return (
    <Pressable
      onPress={onChoose}
      accessibilityRole="button"
      accessibilityLabel={ready ? 'Receipt chosen. Tap to choose a different photo' : 'Upload a photo of your receipt'}
      style={[styles.drop, { alignItems: 'center' }, ready && { borderColor: Colors.light.limeDeep }]}>
      <View style={{ marginBottom: 8 }}>
        <IconTile tone="lime">
          <UploadIcon />
        </IconTile>
      </View>
      <Text style={styles.dropTitle}>{ready ? 'Receipt ready' : 'Upload a photo'}</Text>
      <Text style={styles.dropText}>{ready ? `${state.name}. Tap to choose a different photo` : 'JPG or PNG, up to 5 MB'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 12, gap: 10 },
  cardRed: { borderColor: Colors.light.destructive },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  redText: { fontSize: 14, lineHeight: 20, color: Colors.light.redText, marginTop: 2 },
  cancel: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.light.redText },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.light.lineSoft, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.light.limeDeep },
  pair: { flexDirection: 'row', gap: 10 },
  drop: { padding: 16, minHeight: 110, backgroundColor: Colors.light.card, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.light.line, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dropRed: { borderColor: Colors.light.destructive },
  dropTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  dropText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 3, textAlign: 'center' },
});
