import { useEffect, useMemo, useRef } from 'react';

import { BRAND_HERO_SVG, BRAND_WEB_CSS } from '@/components/brand/brand-web-css.generated';
import { PAL, pickHeroBalls, type BallKey, type BrandMarkProps, type BrandMode, type BrandTone } from '@/components/brand/brand-shared';
import { BALL_FACES, BALL_KEYS } from '@/constants/brand-faces.generated';
import { Font } from '@/constants/theme';
import * as M from '@/lib/brand-motion';

// The web build of the ArenaHub mark. react-native-svg animated props do not update on web, so
// here the mark runs the logo file's own CSS keyframes (generated into brand-web-css.generated.ts
// by scripts/brand-assets.mjs): the same timeline, the same eight balls. Native uses brand-mark.tsx.

const HOLES = [[55, 59], [60, 59], [65, 59], [55, 65], [60, 65], [65, 65], [55, 71], [60, 71], [65, 71], [57.5, 77], [62.5, 77]];

function mark(tone: BrandTone, opts: { ball?: BallKey; noBall?: boolean; ring?: string; dash?: boolean; mk?: string; hole?: string } = {}): string {
  const p = PAL[tone];
  const c = opts.mk ?? p.mk;
  const hole = opts.hole ?? p.hole;
  const racket =
    `<g transform="rotate(24 60 24)"><rect x="57.4" y="22" width="5.2" height="27" rx="2.6" fill="${c}"/><path d="M58 44h4M58 40h4" stroke="${hole}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/><rect x="48" y="50" width="24" height="34" rx="12" fill="${c}"/>` +
    HOLES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.35" fill="${hole}"/>`).join('') +
    '</g>';
  const bat =
    `<g transform="rotate(-24 60 24)"><rect x="57.6" y="22" width="4.8" height="28" rx="2.4" fill="${c}"/><path d="M57.8 29h4.4M57.8 33h4.4M57.8 37h4.4" stroke="${hole}" stroke-width="1" opacity=".5"/><path d="M53 49 Q60 45 67 49 V84 Q67 90 60 90 Q53 90 53 84 Z" fill="${c}"/><path d="M60 53 V84" stroke="${hole}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/></g>`;
  const ring = `<rect x="14" y="16" width="92" height="84" rx="38" fill="none" stroke="${opts.ring ?? p.ringFaint}" stroke-width="3.2" stroke-linecap="round"${opts.dash ? ' stroke-dasharray="7 9"' : ''}/>`;
  let face = BALL_FACES[opts.ball ?? 'football'].svg;
  if ((opts.ball ?? 'football') === 'football') face = face.replace('fill="#FFFFFF"', `fill="${p.foot}"`);
  return ring + `<g transform="translate(-2.5 0)">${racket}${bat}</g>` + (opts.noBall ? '' : `<g transform="translate(60 71)">${face}</g>`);
}

const faceSvg = (key: BallKey, cls: string, style?: string) => `<svg class="${cls}" ${style ? `style="${style}"` : ''} viewBox="-9 -9 18 18" width="18" height="18" aria-hidden="true">${BALL_FACES[key].svg}</svg>`;

const EXTRA_CSS = `
.bm-root{display:inline-block;line-height:0}
.bm-hmark{position:relative;width:264px;height:264px}
.bm-hbox{position:absolute;left:0;top:0;width:120px;height:120px;transform:scale(2.2);transform-origin:0 0}
.bm-shake{position:absolute;inset:0}
.bm-hsvg{position:absolute;left:0;top:0;overflow:visible}
.bm-word{font-size:58px;line-height:1;display:flex}
.bm-word span{display:inline-block;opacity:0}
.bm-tag{font-size:17px;opacity:0}
.bm-shock{position:absolute;left:50%;top:59%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid var(--ac);opacity:0;pointer-events:none}
.bm-lockup{display:flex;flex-direction:column;align-items:center;gap:18px;line-height:normal}
.bm-lockup .bm-word{font-family:${Font.display},'Archivo',sans-serif;font-variation-settings:normal;font-weight:700;letter-spacing:-.025em;color:var(--wd)}
.bm-lockup .bm-tag{font-family:${Font.body},'Inter Tight',sans-serif;color:var(--tg)}
.bm-once .bm-lockup{animation-name:bm-onceWrap!important}
.bm-once *{animation-iteration-count:1!important;animation-fill-mode:forwards!important}
@keyframes bm-onceWrap{0%{opacity:0}1%,100%{opacity:1}}
.bm-on .bm-word span{animation-delay:calc(var(--i) * 45ms / var(--S))!important}
.bm-on .bm-gh.bm-g1{animation-delay:calc(.045s / var(--S))!important}
.bm-on .bm-gh.bm-g2{animation-delay:calc(.09s / var(--S))!important}
.bm-still .bm-ball,.bm-still .bm-f4{opacity:1}
.bm-ld{display:inline-block}
.bm-off .bm-offball{animation:bm-offB 3s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.bm-root *{animation:none!important}
.bm-final .bm-track{stroke-dashoffset:0}.bm-final .bm-rk{opacity:1;transform:rotate(24deg)}.bm-final .bm-bt{opacity:1;transform:rotate(-24deg)}
.bm-final .bm-ball{opacity:1;offset-distance:100%}.bm-final .bm-f4,.bm-final .bm-word span,.bm-final .bm-tag{opacity:1}
.bm-ldreduce .bm-lrun{opacity:0}.bm-ldreduce .bm-lf.bm-k0{opacity:1}.bm-ldreduce .bm-lball{offset-distance:62%}
.bm-ok .bm-okring{stroke-dashoffset:0}.bm-ok .bm-okball{opacity:1;transform:none}}
`;

function Css() {
  return <style dangerouslySetInnerHTML={{ __html: BRAND_WEB_CSS + EXTRA_CSS }} />;
}

const vars = (tone: BrandTone, speed: number): Record<string, string | number> => {
  const p = PAL[tone];
  return { '--mk': p.mk, '--ac': p.ac, '--hole': p.hole, '--spk': p.spk, '--ring': p.ring, '--wd': p.wd, '--tg': p.tg, '--T': `${7.2 / speed}s`, '--S': speed };
};

function Hero({ tone = 'dark', size = 264, speed = 1, balls, onLand, onSettled, withWord = true }: BrandMarkProps) {
  const four = useMemo(() => balls ?? pickHeroBalls(), [balls]);
  const k = size / 264;
  const landed = useRef(onLand);
  const settled = useRef(onSettled);
  landed.current = onLand;
  settled.current = onSettled;
  useEffect(() => {
    const T = (M.HERO_MS / speed);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      landed.current?.();
      settled.current?.();
      return;
    }
    const a = setTimeout(() => landed.current?.(), (M.LAND_PCT / 100) * T);
    const b = setTimeout(() => settled.current?.(), 0.82 * T);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [speed]);
  const faces = four.map((b, i) => faceSvg(b, `bm-f bm-f${i + 1}`)).join('');
  const html =
    `<div class="bm-shock"></div><div class="bm-hbox"><div class="bm-shake"><svg class="bm-hsvg" viewBox="0 0 120 120" width="120" height="120" overflow="visible" aria-hidden="true">${BRAND_HERO_SVG}</svg>` +
    `<div class="bm-gh bm-g2"><i></i></div><div class="bm-gh bm-g1"><i></i></div><div class="bm-ball"><div class="bm-sc"><div class="bm-sp">${faces}</div></div></div></div></div>`;
  return (
    <div className="bm-root bm-on bm-once bm-final" style={{ ...(vars(tone, speed) as object), width: size }} role="img" aria-label="ArenaHub logo">
      <Css />
      <div style={{ width: 264, zoom: k } as object}>
        <div className="bm-lockup">
          <div className="bm-hmark" dangerouslySetInnerHTML={{ __html: html }} />
          {withWord ? (
            <>
              <div className="bm-wordwrap">
                <div className="bm-word" aria-label="ArenaHub">
                  {'ArenaHub'.split('').map((ch, i) => (
                    <span key={i} style={{ '--i': i } as object}>
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bm-tag">Find a court. Get a game.</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Loader({ tone = 'light', size = 72 }: BrandMarkProps) {
  const order = useMemo(() => M.shuffled(BALL_KEYS), []);
  const p = PAL[tone];
  const RING2 = 'M14 58 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V58';
  const html =
    `<div class="bm-ldbox" style="transform:scale(${size / 120})"><svg class="bm-hsvg" viewBox="0 0 120 120" width="120" height="120" overflow="visible" aria-hidden="true">${mark(tone, { noBall: true })}` +
    `<path class="bm-lrun" d="${RING2}" pathLength="200" fill="none" stroke="${p.run}" stroke-width="4.6" stroke-linecap="round"/></svg>` +
    `<div class="bm-lball"><div class="bm-lsp">${order.map((b, i) => faceSvg(b, `bm-lf bm-k${i}`, `--k:${i}`)).join('')}</div></div></div>`;
  return (
    <div className="bm-root bm-ldreduce" role="progressbar" aria-label="Loading" style={{ width: size, height: size, position: 'relative' }}>
      <Css />
      <div className="bm-ld" style={{ width: size, height: size, position: 'relative' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function Success({ tone = 'light', size = 120, onDone }: BrandMarkProps) {
  const p = PAL[tone];
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    ref.current?.classList.add('bm-go');
    const t = setTimeout(() => onDone?.(), 1200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const faint = tone === 'light' ? 'rgba(15,26,21,.18)' : 'rgba(196,245,70,.2)';
  const inner =
    `<rect x="14" y="16" width="92" height="84" rx="38" fill="none" stroke="${faint}" stroke-width="3.2"/>` +
    `<rect class="bm-okring" x="14" y="16" width="92" height="84" rx="38" fill="none" stroke="${p.ac}" stroke-width="3.6" stroke-linecap="round" pathLength="240"/>` +
    mark(tone, { noBall: true, ring: 'transparent' }) +
    `<circle class="bm-okpulse" cx="60" cy="71" r="8" fill="none" stroke="${p.ac}" stroke-width="1.4"/><g class="bm-okball"><g transform="translate(60 71)">${BALL_FACES.football.svg.replace('fill="#FFFFFF"', `fill="${p.foot}"`)}</g></g>`;
  return (
    <div className="bm-root">
      <Css />
      <svg ref={ref} className="bm-ok" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Done" dangerouslySetInnerHTML={{ __html: inner }} />
    </div>
  );
}

function Offline({ size = 120 }: BrandMarkProps) {
  const grey = '#8A968F';
  const inner =
    mark('light', { noBall: true, ring: grey, dash: true, mk: grey, hole: '#F1F2EF' }) +
    `<g class="bm-offball"><g transform="translate(60 71)"><circle r="8" fill="#C9D0CB" stroke="${grey}" stroke-width="1.1"/><path d="M0 -3.8 L3.6 -1.2 L2.2 3 H-2.2 L-3.6 -1.2 Z" fill="${grey}"/></g><path d="M50 83 L70 59" stroke="#CF4141" stroke-width="3" stroke-linecap="round"/></g>`;
  return (
    <div className="bm-root bm-off">
      <Css />
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="No connection" dangerouslySetInnerHTML={{ __html: inner }} />
    </div>
  );
}

export function BrandMark(props: BrandMarkProps) {
  const { mode = 'still', tone = 'light', ball = 'football', size } = props;
  if (mode === 'hero') return <Hero {...props} />;
  if (mode === 'loader') return <Loader {...props} />;
  if (mode === 'success') return <Success {...props} />;
  if (mode === 'offline') return <Offline {...props} />;
  const s = size ?? 72;
  return (
    <svg width={s} height={s} viewBox="0 0 120 120" role="img" aria-label="ArenaHub" dangerouslySetInnerHTML={{ __html: mark(tone, { ball }) }} />
  );
}

export { M as brandMotion, pickHeroBalls };
export type { BallKey, BrandMarkProps, BrandMode, BrandTone };
