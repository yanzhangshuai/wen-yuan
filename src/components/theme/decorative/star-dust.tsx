"use client";

/**
 * 星空粒子背景 — xingkong 装饰
 *
 * 三组星层 + 星云辉光，营造真实星空感：
 * 1. 暗淡密集星层（静态，50+ 星点）
 * 2. 中等亮度星层（静态，20 星点）
 * 3. 明亮星层（闪烁动画，8 星点）
 * 4. 星云辉光（柔和渐变雾气）
 */

/* ---- star position data (x%, y%, opacity) ---- */
type Star = readonly [x: number, y: number, o: number];

const DIM: Star[] = [
  [3,7,.4],[7,42,.3],[11,68,.35],[16,23,.25],[21,85,.4],[27,15,.3],[32,52,.35],
  [37,38,.25],[42,72,.4],[47,5,.3],[52,58,.35],[57,92,.25],[62,28,.4],[67,47,.3],
  [72,78,.35],[77,12,.25],[82,63,.4],[87,35,.3],[92,82,.35],[97,55,.25],
  [5,94,.35],[10,55,.25],[15,35,.4],[20,73,.3],[25,48,.35],[30,10,.25],[35,88,.4],
  [40,20,.3],[45,60,.35],[50,95,.25],[55,30,.4],[60,70,.3],[65,8,.35],[70,55,.25],
  [75,40,.4],[80,90,.3],[85,22,.35],[90,65,.25],[95,45,.4],[2,50,.3],
  [14,80,.25],[24,3,.35],[34,62,.3],[44,46,.25],[54,18,.4],[64,87,.3],
  [74,33,.35],[84,56,.25],[94,74,.4],[4,28,.3]
];

const MEDIUM: Star[] = [
  [8,15,.55],[18,65,.5],[28,40,.6],[38,82,.5],[48,25,.55],[55,55,.5],
  [65,10,.6],[72,70,.55],[82,30,.5],[90,80,.6],[5,50,.55],[35,5,.5],
  [62,90,.6],[78,48,.55],[95,18,.5]
];

const BRIGHT: Star[] = [
  [15,22,.8],[42,68,.7],[68,38,.8],[88,72,.7],[25,88,.75],[75,12,.8]
];

const BRIGHT_ALT: Star[] = [
  [8,55,.7],[35,15,.75],[58,82,.7],[82,42,.75],[52,5,.7]
];

function layer(stars: Star[], size: string, color = "200,210,225"): string {
  return stars
    .map(([x, y, o]) => `radial-gradient(${size} ${size} at ${x}% ${y}%, rgba(${color},${o}) 0%, transparent 100%)`)
    .join(", ");
}

function glowLayer(stars: Star[], size: string, color = "170,185,210"): string {
  return stars
    .map(([x, y, o]) => `radial-gradient(${size} ${size} at ${x}% ${y}%, rgba(${color},${o * 0.3}) 0%, transparent 100%)`)
    .join(", ");
}

/* Pre-computed CSS background strings */
const DIM_BG      = layer(DIM, "0.5px");
const MEDIUM_BG   = layer(MEDIUM, "1px", "190,200,220");
const BRIGHT_BG   = [layer(BRIGHT, "1.5px", "220,225,240"), glowLayer(BRIGHT, "4px")].join(", ");
const BRIGHT_ALT_BG = [layer(BRIGHT_ALT, "1.5px", "180,195,215"), glowLayer(BRIGHT_ALT, "3px")].join(", ");
const NEBULA_BG   = [
  "radial-gradient(ellipse 60% 35% at 25% 55%, rgba(123,144,175,0.04) 0%, transparent 100%)",
  "radial-gradient(ellipse 45% 25% at 75% 30%, rgba(100,120,160,0.03) 0%, transparent 100%)",
  "radial-gradient(ellipse 80% 20% at 50% 90%, rgba(90,110,150,0.025) 0%, transparent 100%)"
].join(", ");

export function StarDust() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
      {/* Dense dim stars */}
      <div className="absolute inset-0" style={{ background: DIM_BG }} />
      {/* Medium stars */}
      <div className="absolute inset-0" style={{ background: MEDIUM_BG }} />
      {/* Bright stars — twinkling */}
      <div
        className="absolute inset-0"
        style={{ background: BRIGHT_BG, animation: "twinkle 4s ease-in-out infinite" }}
      />
      {/* Bright stars offset — slower twinkle */}
      <div
        className="absolute inset-0"
        style={{ background: BRIGHT_ALT_BG, animation: "twinkle-slow 6s ease-in-out infinite" }}
      />
      {/* Nebula glow */}
      <div className="absolute inset-0" style={{ background: NEBULA_BG }} />
    </div>
  );
}
