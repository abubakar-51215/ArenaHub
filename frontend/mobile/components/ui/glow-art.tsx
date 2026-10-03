import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View } from 'react-native';

import { GlowCardDef, GlowHomeDef, GlowProfileDef } from '@/constants/icons.generated';

/** Home hero background (design/prototypes line 704): ink rect, lime glow circle, two faint lines. */
export function GlowHome({ width, height }: { width: number; height: number }) {
  const def = GlowHomeDef;
  return (
    <Svg width={width} height={height} viewBox={def.viewBox} preserveAspectRatio="none">
      <Rect width={Number(def.viewBox.split(' ')[2])} height={Number(def.viewBox.split(' ')[3])} fill={def.rectFill} />
      <Circle
        cx={Number(def.circle.cx)}
        cy={Number(def.circle.cy)}
        r={Number(def.circle.r)}
        fill={def.circle.fill}
        fillOpacity={Number(def.circle.fillOpacity)}
      />
      {def.lines && (
        <Path d={def.lines.d} stroke={def.lines.stroke} strokeOpacity={Number(def.lines.strokeOpacity)} />
      )}
    </Svg>
  );
}

/** Profile hero background (design/prototypes line 998): ink rect + lime glow circle, no lines. */
export function GlowProfile({ width, height }: { width: number; height: number }) {
  const def = GlowProfileDef;
  return (
    <Svg width={width} height={height} viewBox={def.viewBox} preserveAspectRatio="none">
      <Rect width={Number(def.viewBox.split(' ')[2])} height={Number(def.viewBox.split(' ')[3])} fill={def.rectFill} />
      <Circle
        cx={Number(def.circle.cx)}
        cy={Number(def.circle.cy)}
        r={Number(def.circle.r)}
        fill={def.circle.fill}
        fillOpacity={Number(def.circle.fillOpacity)}
      />
    </Svg>
  );
}

/** Card glow overlay (design/prototypes line 930): a lime circle over a photo, inside a .3-opacity wrapper. */
export function GlowCard({ width, height }: { width: number; height: number }) {
  const def = GlowCardDef;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: Number(def.wrapperOpacity) }}>
      <Svg width={width} height={height} viewBox={def.viewBox} preserveAspectRatio="none">
        <Circle
          cx={Number(def.circle.cx)}
          cy={Number(def.circle.cy)}
          r={Number(def.circle.r)}
          fill={def.circle.fill}
          fillOpacity={Number(def.circle.fillOpacity)}
        />
      </Svg>
    </View>
  );
}
