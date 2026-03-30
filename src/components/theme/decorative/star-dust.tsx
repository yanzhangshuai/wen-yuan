"use client";

import * as React from "react";

/**
 * 星空Canvas背景 — xingkong 装饰
 * 深黑底 + 多彩星云 + 低密度星点（五彩斑斓但保持克制）
 */

interface StarData {
  x: number; y: number; r: number;
  baseA: number; phase: number; speed: number;
  cr: number; cg: number; cb: number;
}
interface NebulaData { x: number; y: number; radius: number; cr: number; cg: number; cb: number; a: number }
interface MeteorData { x: number; y: number; len: number; angle: number; spd: number; a: number; tail: number; on: boolean }

function pickNebulaColor() {
  const colors = [
    { cr: 86, cg: 122, cb: 208 },  // royal blue
    { cr: 108, cg: 90, cb: 206 },  // violet
    { cr: 72, cg: 170, cb: 178 },  // teal
    { cr: 188, cg: 94, cb: 172 },  // magenta
    { cr: 198, cg: 150, cb: 92 }   // amber
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function StarDust() {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const raf = React.useRef(0);

  React.useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    let stars: StarData[] = [];
    let nebulae: NebulaData[] = [];
    const meteors: MeteorData[] = [];
    let meteorCD = 0;

    function resize() {
      if (!cvs) return;
      W = cvs.width = window.innerWidth;
      H = cvs.height = window.innerHeight;
      init();
    }

    function init() {
      const count = Math.floor((W * H) / 5200);
      stars = [];
      for (let i = 0; i < count; i++) {
        const bright = Math.random() < 0.065;
        const z = Math.random();
        const r = bright ? Math.random() * 1.2 + 0.9 : z > 0.7 ? Math.random() * 0.62 + 0.22 : Math.random() * 0.35 + 0.08;
        const baseA = bright ? Math.random() * 0.26 + 0.42 : z * 0.22 + Math.random() * 0.16;
        const roll = Math.random();
        let cr: number, cg: number, cb: number;
        if (roll < 0.48) { cr = 196 + Math.random() * 30; cg = 216 + Math.random() * 26; cb = 255; } // cool white
        else if (roll < 0.66) { cr = 152 + Math.random() * 34; cg = 204 + Math.random() * 32; cb = 255; } // cyan blue
        else if (roll < 0.80) { cr = 198 + Math.random() * 28; cg = 164 + Math.random() * 24; cb = 255; } // violet
        else if (roll < 0.92) { cr = 236 + Math.random() * 16; cg = 156 + Math.random() * 20; cb = 232 + Math.random() * 18; } // pink
        else { cr = 246 + Math.random() * 9; cg = 202 + Math.random() * 26; cb = 152 + Math.random() * 18; } // amber
        stars.push({ x: Math.random() * W, y: Math.random() * H, r, baseA, phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.015 + 0.004, cr, cg, cb });
      }

      nebulae = [];
      const scatterCount = Math.floor(W / 300);
      for (let i = 0; i < scatterCount; i++) {
        nebulae.push({ x: Math.random() * W, y: Math.random() * H, radius: Math.random() * 260 + 130, ...pickNebulaColor(), a: Math.random() * 0.020 + 0.008 });
      }
      const bandCount = Math.floor(W / 150);
      for (let i = 0; i < bandCount; i++) {
        const t = i / bandCount;
        nebulae.push({ x: W * t + (Math.random() - 0.5) * 130, y: H * 0.3 + H * 0.4 * t + (Math.random() - 0.5) * 150, radius: Math.random() * 180 + 80, ...pickNebulaColor(), a: Math.random() * 0.022 + 0.010 });
      }
      meteors.length = 0;
      for (let i = 0; i < 3; i++) {
        meteors.push({ x: 0, y: 0, len: 0, angle: 0, spd: 0, a: 0, tail: 0, on: false });
      }
    }

    function spawnMeteor(m: MeteorData) {
      m.x = Math.random() * W * 0.8; m.y = Math.random() * H * 0.3;
      m.len = Math.random() * 200 + 100; m.angle = (15 + Math.random() * 25) * Math.PI / 180;
      m.spd = Math.random() * 7 + 4; m.a = 0; m.tail = 0; m.on = true;
    }

    function tick() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (const n of nebulae) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
        g.addColorStop(0, `rgba(${n.cr}, ${n.cg}, ${n.cb}, ${n.a})`);
        g.addColorStop(0.5, `rgba(${n.cr}, ${n.cg}, ${n.cb}, ${n.a * 0.4})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      for (const s of stars) {
        s.phase += s.speed;
        const twinkle = Math.sin(s.phase) * 0.24 + 0.70;
        const a = s.baseA * twinkle;
        if (s.r > 0.8) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          g.addColorStop(0, `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a * 0.34})`);
          g.addColorStop(0.4, `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a * 0.12})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a})`;
        ctx.fill();
      }
      meteorCD++;
      if (meteorCD > 260 && Math.random() < 0.010) {
        const idle = meteors.find(m => !m.on);
        if (idle) { spawnMeteor(idle); meteorCD = 0; }
      }
      for (const m of meteors) {
        if (!m.on) continue;
        m.tail = Math.min(m.tail + m.spd * 2.5, m.len);
        m.x += Math.cos(m.angle) * m.spd; m.y += Math.sin(m.angle) * m.spd;
        m.a = m.tail < m.len * 0.25 ? Math.min(1, m.a + 0.08) : m.tail > m.len * 0.7 ? Math.max(0, m.a - 0.04) : m.a;
        if (m.a <= 0 && m.tail >= m.len) { m.on = false; continue; }
        const ex = m.x + Math.cos(m.angle) * m.tail;
        const ey = m.y + Math.sin(m.angle) * m.tail;
        const g = ctx.createLinearGradient(m.x, m.y, ex, ey);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.3, `rgba(186,206,252,${m.a * 0.26})`);
        g.addColorStop(1, `rgba(245,232,255,${m.a * 0.70})`);
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey);
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round"; ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${m.a})`; ctx.fill();
      }
      raf.current = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    raf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: "linear-gradient(180deg, #010107 0%, #030511 42%, #04091a 78%, #02040f 100%)" }}
      aria-hidden="true"
    />
  );
}
