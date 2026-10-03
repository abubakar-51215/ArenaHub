import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BrandMarkDef } from '@/constants/icons.generated';

/** The ArenaHub square-with-"A" glyph (design/prototypes, lines 635 & 685 — identical both times). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={BrandMarkDef.viewBox}>
      {BrandMarkDef.shapes.map((shape, i) => {
        const key = `brand-${i}`;
        const common = {
          fill: shape.fill,
          stroke: shape.stroke,
          strokeWidth: shape.strokeWidth ? Number(shape.strokeWidth) : undefined,
          strokeLinecap: shape.strokeLinecap as 'round' | 'butt' | 'square' | undefined,
          strokeLinejoin: shape.strokeLinejoin as 'round' | 'miter' | 'bevel' | undefined,
        };
        if (shape.type === 'rect')
          return (
            <Rect key={key} width={Number(shape.width)} height={Number(shape.height)} rx={Number(shape.rx)} {...common} />
          );
        if (shape.type === 'path') return <Path key={key} d={shape.d!} {...common} />;
        if (shape.type === 'circle')
          return <Circle key={key} cx={Number(shape.cx)} cy={Number(shape.cy)} r={Number(shape.r)} {...common} />;
        return null;
      })}
    </Svg>
  );
}
