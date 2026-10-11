import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/** A few line icons the G6 frames use that the generated icon set does not have. Same 24 grid, 1.9 stroke, round caps. */
export type ExtraIconName = 'clock' | 'receipt' | 'doc' | 'trash' | 'camera' | 'share' | 'check' | 'lifebuoy' | 'edit' | 'flag' | 'minus' | 'plus' | 'bookings' | 'people' | 'close';

const SHAPES: Record<ExtraIconName, (c: string) => React.ReactNode> = {
  clock: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} />
      <Path d="M12 7v5l3 2" stroke={c} />
    </>
  ),
  receipt: (c) => <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" stroke={c} />,
  doc: (c) => <Path d="M7 3h7l4 4v14H7V3zM14 3v4h4M10 12h5M10 16h5" stroke={c} />,
  trash: (c) => <Path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke={c} />,
  camera: (c) => (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3v11H4V8z" stroke={c} />
      <Circle cx={12} cy={13} r={3.5} stroke={c} />
    </>
  ),
  share: (c) => <Path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" stroke={c} />,
  check: (c) => <Path d="M5 12.5l4.5 4.5L19 7" stroke={c} />,
  lifebuoy: (c) => (
    <>
      <Circle cx={12} cy={12} r={9} stroke={c} />
      <Circle cx={12} cy={12} r={3.5} stroke={c} />
      <Path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" stroke={c} />
    </>
  ),
  edit: (c) => <Path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" stroke={c} />,
  flag: (c) => <Path d="M5 21V4M5 4h11l-2 4 2 4H5" stroke={c} />,
  minus: (c) => <Path d="M5 12h14" stroke={c} />,
  plus: (c) => <Path d="M12 5v14M5 12h14" stroke={c} />,
  bookings: (c) => (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={2.5} stroke={c} />
      <Path d="M8 3v4M16 3v4M3 10h18" stroke={c} />
    </>
  ),
  people: (c) => (
    <>
      <Circle cx={9} cy={8} r={3.2} stroke={c} />
      <Path d="M3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5M16 5a3 3 0 010 6M18 15c2 .5 3 2 3.2 5" stroke={c} />
    </>
  ),
  close: (c) => <Path d="M6 6l12 12M18 6L6 18" stroke={c} />,
};

export function IconExtra({ name, size = 18, color = Colors.light.text }: { name: ExtraIconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[name](color)}
    </Svg>
  );
}
