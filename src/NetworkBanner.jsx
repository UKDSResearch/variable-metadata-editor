import React, { useEffect, useRef } from 'react';

// Dark header with a drawn node-and-edge network, echoing the ingest pipeline banner.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const rand = mulberry32(9349);

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0d0d10');
  bg.addColorStop(0.55, '#1c1c22');
  bg.addColorStop(1, '#2a2a31');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Denser network toward the right, like the reference banner.
  const nodes = [];
  const count = Math.round(w / 9);
  for (let i = 0; i < count; i++) {
    const x = Math.pow(rand(), 0.55) * w;
    nodes.push({ x, y: rand() * h, r: rand() * 1.8 + 0.6, a: 0.25 + (x / w) * 0.75 });
  }
  const maxD = 120;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d = Math.hypot(dx, dy);
      if (d < maxD) {
        ctx.strokeStyle = `rgba(230,230,240,${(1 - d / maxD) * 0.32 * Math.min(nodes[i].a, nodes[j].a)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }
  // A few faceted triangles for depth.
  for (let k = 0; k < 7; k++) {
    const a = nodes[Math.floor(rand() * nodes.length)];
    const b = nodes[Math.floor(rand() * nodes.length)];
    const c = nodes[Math.floor(rand() * nodes.length)];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 160 || Math.hypot(a.x - c.x, a.y - c.y) > 160) continue;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }
  for (const n of nodes) {
    ctx.fillStyle = `rgba(255,255,255,${n.a})`;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Keep the title side readable.
  const fade = ctx.createLinearGradient(0, 0, w * 0.6, 0);
  fade.addColorStop(0, 'rgba(10,10,12,0.85)');
  fade.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
}

export default function NetworkBanner({ crumbs, title }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="banner">
      <canvas ref={ref} className="banner-canvas" aria-hidden="true" />
      <div className="banner-inner">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c}>
              {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
              <span>{c}</span>
            </span>
          ))}
        </nav>
        <h1>{title}</h1>
      </div>
    </header>
  );
}
