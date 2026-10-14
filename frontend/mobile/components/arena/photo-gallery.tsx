import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArenaImage } from '@/components/ui/arena-image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HeartButton } from '@/components/venue';
import { Colors } from '@/constants/theme';
import { TapBox } from '@/components/ui/tap-box';

/**
 * The photo area of the Arena screen (arena-hub-player-app-arena-slots.html):
 * 176 high, swipes between photos, with a "1 / N" counter, dots (the current
 * one is a wider lime bar), a glass back button and the heart. With no photo,
 * the court picture of the arena's sport is drawn. A full-screen viewer and
 * sharing are later work.
 */
export function PhotoGallery({ arenaId, photos, sport }: { arenaId: string; photos: string[]; sport?: string }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const count = photos.length;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View style={[styles.box, { height: 176 + insets.top }]}>
      {count > 0 ? (
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          renderItem={({ item }) => <ArenaImage photo={item} sport={sport} style={{ width, height: 176 + insets.top }} />}
          accessibilityLabel={`Photos, ${count}`}
        />
      ) : (
        <ArenaImage photo={null} sport={sport} style={{ width, height: 176 + insets.top }} />
      )}
      <TapBox
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        slop={4}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={{ position: 'absolute', top: insets.top + 10, left: 14 }}
        inner={styles.glass}>
        <Icon name="back" size={16} color="#FFFFFF" />
      </TapBox>
      <View style={{ position: 'absolute', top: insets.top, right: 0, left: 0 }} pointerEvents="box-none">
        <HeartButton arenaId={arenaId} hero />
      </View>
      {count > 1 ? (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {count}
            </Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.light.ink },
  glass: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: 10, right: 14, backgroundColor: 'rgba(10,16,13,0.6)', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 },
  // the photo count carries information: 14px
  counterText: { fontSize: 14, color: '#FFFFFF' },
  dots: { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { width: 16, backgroundColor: Colors.light.lime },
});
