import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { courtArtFor } from '@/constants/sports';

/**
 * The prototype's court pictures (art() in arena-hub-player-app-home-search.html),
 * path for path: cricket, badminton and padel have their own; every other sport
 * uses the plain pitch. Fills its parent.
 */
export function CourtArt({ sport }: { sport?: string }) {
  const kind = courtArtFor(sport);
  const common = { width: '100%', height: '100%', viewBox: '0 0 300 120', preserveAspectRatio: 'none' } as const;
  const base = <Rect width={300} height={120} fill="#0F1A15" />;
  if (kind === 'cricket')
    return (
      <Svg {...common}>
        {base}
        <Ellipse cx={150} cy={60} rx={180} ry={110} fill="none" stroke="#C4F546" strokeOpacity={0.2} strokeWidth={2} />
        <Rect x={120} y={18} width={60} height={84} fill="none" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} />
        <G stroke="#C4F546" strokeOpacity={0.8} strokeWidth={2.5}>
          <Path d="M141 92v-16M150 92v-16M159 92v-16" />
        </G>
      </Svg>
    );
  if (kind === 'badminton')
    return (
      <Svg {...common}>
        {base}
        <Rect x={60} y={14} width={180} height={92} fill="none" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} />
        <Path d="M150 14v92" stroke="#C4F546" strokeOpacity={0.6} strokeWidth={2} />
        <Path d="M60 40h180M60 80h180M105 14v92M195 14v92" stroke="#EAF6D8" strokeOpacity={0.18} strokeWidth={1.5} />
      </Svg>
    );
  if (kind === 'padel')
    return (
      <Svg {...common}>
        {base}
        <Rect x={34} y={16} width={232} height={88} fill="none" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} rx={2} />
        <Path d="M150 16v88" stroke="#C4F546" strokeOpacity={0.6} strokeWidth={2} />
        <Path d="M34 60h232M82 16v88M218 16v88" stroke="#EAF6D8" strokeOpacity={0.18} strokeWidth={1.5} />
      </Svg>
    );
  return (
    <Svg {...common}>
      {base}
      <Rect x={26} y={14} width={248} height={92} fill="none" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} rx={2} />
      <Path d="M150 14v92" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} />
      <Circle cx={150} cy={60} r={24} fill="none" stroke="#C4F546" strokeOpacity={0.55} strokeWidth={2} />
      <Circle cx={150} cy={60} r={3} fill="#C4F546" />
      <Path d="M26 40h26v40H26M274 40h-26v40h26" fill="none" stroke="#EAF6D8" strokeOpacity={0.3} strokeWidth={2} />
    </Svg>
  );
}
