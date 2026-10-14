import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Colors, Font } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { useNetwork } from '@/lib/network';
import { askAssistant, type AssistantAnswer } from '@/services/assistant';
import { useAuthStore } from '@/store/auth';

// The ArenaHub assistant (arena-hub-player-app-smart.html, frames 6 to 12): a greeting with question chips (no typing
// needed), the player's question on the right, the answer on the left with a button to open the right screen and the
// next question chips; three dots while it answers (10 seconds at most); "We could not get an answer." with Try again on
// the same question; offline, the box says "Needs a connection" and the banner shows at the top. The conversation lives
// only on this screen: nothing is kept after it closes (or after signing out).
const STARTERS = [
  { id: 'next_booking', label: 'When is my next booking?' },
  { id: 'cancel', label: 'How do I cancel?' },
  { id: 'refund_status', label: 'Where is my refund?' },
  { id: 'bank_transfer', label: 'How do I pay by bank transfer?' },
];
const MAX = 300;

type Ask = { text: string } | { suggestion: string };
type Turn =
  | { who: 'me'; text: string }
  | { who: 'bot'; answer: AssistantAnswer }
  | { who: 'failed'; ask: Ask };

export default function AssistantScreen() {
  const first = useAuthStore((s) => s.user?.full_name.trim().split(/\s+/)[0]);
  const online = useNetwork((s) => s.online);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [turns, busy]);

  const send = async (ask: Ask, shown: string | null) => {
    if (busy || !online) return;
    tapHaptic();
    setBusy(true);
    setTurns((t) => [...t.filter((x) => x.who !== 'failed'), ...(shown ? [{ who: 'me' as const, text: shown }] : [])]);
    try {
      const answer = await askAssistant(ask);
      setTurns((t) => [...t, { who: 'bot', answer }]);
    } catch {
      setTurns((t) => [...t, { who: 'failed', ask }]);
    } finally {
      setBusy(false);
    }
  };

  const sendTyped = () => {
    const q = text.trim();
    if (!q) return;
    setText('');
    void send({ text: q }, q);
  };

  const open = (a: AssistantAnswer['actions'][number]) => {
    if (a.kind === 'open_booking' && a.target) router.push({ pathname: '/booking/detail/[groupId]', params: { groupId: a.target } } as unknown as Href);
    else if (a.kind === 'open_payments') router.push('/profile/payments' as Href);
    else if (a.kind === 'open_new_complaint') router.push('/support/new' as Href);
    else if (a.kind === 'open_my_matches') router.push({ pathname: '/(tabs)/play', params: { tab: 'mine' } } as unknown as Href);
    else if (a.kind === 'open_search') router.push('/(tabs)/search' as Href);
  };

  const lastBot = [...turns].reverse().find((t) => t.who === 'bot') as { who: 'bot'; answer: AssistantAnswer } | undefined;
  const chips = turns.length === 0 ? STARTERS : turns[turns.length - 1].who === 'bot' ? lastBot?.answer.suggestions ?? [] : [];
  const canSend = online && !busy && text.trim().length > 0;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="ArenaHub assistant" />
      <KeyboardScroll
        ref={scroll}
        contentContainerStyle={styles.pad}
        footer={
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX))}
              placeholder={online ? 'Type your question' : 'Needs a connection'}
              placeholderTextColor={Colors.light.muted}
              editable={online}
              maxLength={MAX}
              returnKeyType="send"
              enterKeyHint="send"
              onSubmitEditing={sendTyped}
              accessibilityLabel="Type your question"
              style={styles.input}
            />
            <Pressable
              onPress={sendTyped}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              style={[styles.send, canSend && styles.sendOn]}>
              {/* the frame's send arrow */}
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M5 4 L20 12 L5 20 L8 12 Z" fill={Colors.light.paper} />
              </Svg>
            </Pressable>
          </View>
        }>
        <View style={[styles.bot, styles.bubble]}>
          <Text style={styles.botText}>
            {`Hi${first ? ` ${first}` : ''}. I can help with bookings, refunds, payments and matches.${online ? ' What do you need?' : ''}`}
          </Text>
        </View>

        {turns.map((t, i) =>
          t.who === 'me' ? (
            <View key={i} style={[styles.me, styles.bubble]}>
              <Text style={styles.meText}>{t.text}</Text>
            </View>
          ) : t.who === 'bot' ? (
            <View key={i} style={[styles.bot, styles.bubble]} accessibilityLiveRegion="polite">
              <Text style={styles.botText}>{t.answer.answer}</Text>
              {t.answer.actions.map((a) => (
                <Pressable key={a.kind} onPress={() => open(a)} accessibilityRole="button" accessibilityLabel={a.label} style={styles.action}>
                  <Text style={styles.actionText}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View key={i} style={[styles.bot, styles.bubble, styles.failed]} accessibilityRole="alert">
              <Text style={styles.botText}>We could not get an answer.</Text>
              <Pressable onPress={() => void send(t.ask, null)} disabled={!online} accessibilityRole="button" accessibilityLabel="Try again" style={styles.action}>
                <Text style={styles.actionText}>Try again</Text>
              </Pressable>
            </View>
          ),
        )}

        {busy ? <Typing /> : null}

        {online && !busy && chips.length ? (
          <View style={styles.chips}>
            {chips.map((c) => (
              <Pressable key={c.id} onPress={() => void send({ suggestion: c.id }, c.label)} accessibilityRole="button" accessibilityLabel={c.label} style={styles.chip}>
                <Text style={styles.chipText}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

/** Frame 8: three dots (still with reduce motion). */
function Typing() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withSequence(withTiming(0.35, { duration: 450 }), withTiming(1, { duration: 450 })), -1);
  }, [reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={[styles.bot, styles.bubble, styles.typing]} accessibilityLabel="The assistant is answering">
      <Animated.View style={[styles.dots, style]}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18, gap: 10 },
  bubble: { maxWidth: '84%', borderRadius: 15, paddingVertical: 11, paddingHorizontal: 13, gap: 10 },
  bot: { alignSelf: 'flex-start', backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1 },
  botText: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
  me: { alignSelf: 'flex-end', backgroundColor: Colors.light.ink },
  meText: { fontSize: 14, lineHeight: 20, color: Colors.light.paper },
  failed: { borderColor: Colors.light.redText },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderColor: Colors.light.ink, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 13 },
  actionText: { fontSize: 14, fontFamily: Font.bodyBold, color: Colors.light.text },
  chips: { gap: 8, alignItems: 'flex-start' },
  chip: { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13 },
  chipText: { fontSize: 14, color: Colors.light.text },
  typing: { paddingVertical: 15 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.light.muted },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopColor: Colors.light.line, borderTopWidth: 1, backgroundColor: Colors.light.paper },
  input: { flex: 1, height: 44, borderRadius: 14, borderColor: Colors.light.line, borderWidth: 1, backgroundColor: Colors.light.card, paddingHorizontal: 13, fontSize: 14, color: Colors.light.text, outlineStyle: 'none' } as object,
  send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#808683' },
  sendOn: { backgroundColor: Colors.light.ink },
});
