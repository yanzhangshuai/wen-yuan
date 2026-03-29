"use client";

import * as React from "react";

/**
 * 星空Canvas背景 — xingkong 装饰
 * 多光谱星层 + 银河星云带 + 流星动画
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
    { cr: 90, cg: 130, cb: 200 },
    { cr: 150, cg: 90, cb: 170 },
    { cr: 70, cg: 150, cb: 150 },
    { cr: 170, cg: 110, cb: 150 },
    { cr: 90, cg: 170, cb: 130 }
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
      const count = Math.floor((W * H) / 3000);
      stars = [];
      for (let i = 0; i < count; i++) {
        const bright = Math.random() < 0.08;
        const z = Math.random();
        const r = bright ? Math.random() * 1.6 + 1.0 : z > 0.7 ? Math.random() * 0.7 + 0.3 : Math.random() * 0.4 + 0.1;
        const baseA = bright ? Math.random() * 0.3 + 0.6 : z * 0.5 + Math.random() * 0.25;
        const roll = Math.random();
        let cr: number, cg: number, cb: number;
        if (roll < 0.35) { cr = 180 + Math.random() * 40; cg = 210 + Math.random() * 30; cb = 255; }
        else if (roll < 0.55) { cr = 255; cg = 248 + Math.random() * 7; cb = 240 + Math.random() * 15; }
        else if (roll < 0.75) { cr = 255; cg = 230 + Math.random() * 20; cb = 190 + Math.random() * 40; }
        else if (roll < 0.90) { cr = 255; cg = 200 + Math.random() * 30; cb = 140 + Math.random() * 30; }
        else { cr = 255; cg = 160 + Math.random() * 30; cb = 120 + Math.random() * 30; }
        stars.push({ x: Math.random() * W, y: Math.random() * H, r, baseA, phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.015 + 0.004, cr, cg, cb });
      }

      nebulae = [];
      const scatterCount = Math.floor(W / 220);
      for (let i = 0; i < scatterCount; i++) {
        nebulae.push({ x: Math.random() * W, y: Math.random() * H, radius: Math.random() * 280 + 120, ...pickNebulaColor(), a: Math.random() * 0.03 + 0.01 });
      }
      const bandCount = Math.floor(W / 90);
      for (let i = 0; i < bandCount; i++) {
        const t = i / bandCount;
        nebulae.push({ x: W * t + (Math.random() - 0.5) * 150, y: H * 0.3 + H * 0.4 * t + (Math.random() - 0.5) * 180, radius: Math.random() * 200 + 80, ...pickNebulaColor(), a: Math.random() * 0.035 + 0.015 });
      }
      meteors.length = 0;
      for (let i = 0; i < 4; i++) {
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
        const twinkle = Math.sin(s.phase) * 0.3 + 0.7;
        const a = s.baseA * twinkle;
        if (s.r > 0.8) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          g.addColorStop(0, `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a * 0.45})`);
          g.addColorStop(0.4, `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a * 0.15})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.cr}, ${s.cg}, ${s.cb}, ${a})`;
        ctx.fill();
        if (s.r > 1.5 && a > 0.55) {
          ctx.save(); ctx.globalAlpha = a * 0.3;
          ctx.strokeStyle = `rgb(${s.cr}, ${s.cg}, ${s.cb})`; ctx.lineWidth = 0.5;
          const arm = s.r * 9;
          ctx.beginPath(); ctx.moveTo(s.x - arm, s.y); ctx.lineTo(s.x + arm, s.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x, s.y - arm); ctx.lineTo(s.x, s.y + arm); ctx.stroke();
          ctx.restore();
        }
      }
      meteorCD++;
      if (meteorCD > 200 && Math.random() < 0.015) {
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
        g.addColorStop(0.3, `rgba(200,230,255,${m.a * 0.3})`);
        g.addColorStop(1, `rgba(255,255,255,${m.a * 0.8})`);
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey);
        ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.stroke();
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
      style={{ background: "linear-gradient(to bottom, #030508 0%, #0a0c14 50%, #050810 100%)" }}
      aria-hidden="true"
    />
  );
}
