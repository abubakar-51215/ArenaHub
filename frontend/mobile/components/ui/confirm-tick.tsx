import Svg, { Path } from 'react-native-svg';

import { BigTickDef } from '@/constants/icons.generated';

/**
 * The large confirmation-screen checkmark (design/prototypes line 881): same
 * path as the `tick` icon in the `I` object, but at its own size (34px) and
 * stroke width (2.6, vs the small tick's 2.4) — kept as its own component
 * rather than an `<Icon name="tick">` override so the distinct instance is
 * discoverable on its own.
 */
export function ConfirmTick({ size = 34, color = '#0F1A15' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={BigTickDef.viewBox} fill="none">
      <Path
        d={BigTickDef.d}
        stroke={color}
        strokeWidth={Number(BigTickDef.strokeWidth)}
        strokeLinecap={BigTickDef.strokeLinecap as 'round'}
      />
    </Svg>
  );
}
