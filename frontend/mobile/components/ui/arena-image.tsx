import { Image, type ImageProps } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import { resolveMediaUrl } from '@/lib/media';

interface ArenaImageProps extends Omit<ImageProps, 'source' | 'style'> {
  /** Raw photo field from the API — absolute URL, relative upload path, or
   * null/undefined. Resolved via lib/media.ts (fixes the avatar 404: a
   * relative path needs the API's own origin, not the page's). */
  photo?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Overlays drawn on top of the image/fallback — the prototype's
   * translucent glass buttons and counter pill (.m-vis .pin / .m-vis .cnt)
   * stay exactly as each screen already draws them; this just gives them
   * something positioned to sit on top of. */
  children?: React.ReactNode;
  /** Replaces the default `.m-vis` ink block when there's no photo — for
   * the avatar, which keeps its own initials-on-circle fallback rather than
   * the ink block (nothing in the spec says an avatar should go blank). */
  fallback?: React.ReactNode;
}

/** `.m-vis` (arena-hub-player-app.html): ink block when there's no photo —
 * and, now, also the loading placeholder under a photo that hasn't decoded
 * yet. The original per-screen styles each had `backgroundColor: lineSoft`
 * behind the Image for exactly this reason (so a slow network showed a
 * placeholder, not a blank hole); that got dropped in the first draft of
 * this component because the capture harness waits for images to finish
 * loading and so never renders the in-between state. Fixed by always
 * painting this layer underneath, not only when there's no photo. Skipped
 * when a custom `fallback` is given (the avatar): that fallback replaces
 * this layer entirely rather than sitting under the photo, matching the
 * avatar's original card-background-and-initials look with no ink flash. */
export function ArenaImage({ photo, style, children, fallback, ...props }: ArenaImageProps) {
  const uri = resolveMediaUrl(photo);
  return (
    <View style={[styles.container, style]}>
      {fallback === undefined && <View style={[StyleSheet.absoluteFill, styles.fallback]} />}
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" {...props} />
      ) : (
        (fallback ?? null)
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden' },
  fallback: { backgroundColor: Colors.light.ink },
});
