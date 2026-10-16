import Svg, { Path } from 'react-native-svg';

import { RatingStarDef } from '@/constants/icons.generated';

/**
 * The review-rating star (design/prototypes line ~660): same path as the
 * `star` icon in the `I` object, but toggles between filled (rated) and
 * outlined (unrated) at a fixed stroke width, always 11px.
 */
export function RatingStar({ filled, color = '#D9930B', size = 11 }: { filled: boolean; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={RatingStarDef.viewBox}>
      <Path
        d={RatingStarDef.d}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={Number(RatingStarDef.strokeWidth)}
      />
    </Svg>
  );
}
