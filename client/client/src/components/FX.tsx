import { useEffect, useRef } from 'react';

export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext('2d')!;
    let W = 0, H = 0, raf = 0;
    const COLORS = ['rgba(157,78,221,', 'rgba(57,255,139,', 'rgba(33,230,255,'];
    const P = Array.from({ length: 60 }, (_, i) => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 2 + 0.6,
      sp: Math.random() * 0.4 + 0.1, d: Math.random() * 6, c: COLORS[i % 3], a: Math.random() * 0.4 + 0.1,
    }));
    const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    const loop = () => {
      x.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y -= p.sp / H; p.d += 0.01; const px = (p.x * W) + Math.sin(p.d) * 6, py = p.y * H;
        if (py < -5) { p.y = 1 + 0.01; p.x = Math.random(); }
        x.beginPath(); x.arc(px, py, p.r, 0, 7); x.fillStyle = p.c + p.a + ')';
        x.shadowBlur = 8; x.shadowColor = p.c + '1)'; x.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fx-particles" />;
}

export function TableLightning() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext('2d')!;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    const t = setTimeout(resize, 80); addEventListener('resize', resize);
    const bolt = () => {
      if (!c.width) return;
      x.clearRect(0, 0, c.width, c.height);
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        x.beginPath();
        let px = c.width * (0.2 + Math.random() * 0.6), py = c.height * 0.5;
        x.moveTo(px, py);
        const st = 5 + ((Math.random() * 4) | 0);
        for (let s = 0; s < st; s++) { px += (Math.random() - 0.5) * 70; py += (Math.random() - 0.5) * 46; x.lineTo(px, py); }
        x.strokeStyle = Math.random() < 0.5 ? 'rgba(157,78,221,.5)' : 'rgba(57,255,139,.45)';
        x.lineWidth = 1.3; x.shadowBlur = 10; x.shadowColor = x.strokeStyle; x.stroke();
      }
      setTimeout(() => x.clearRect(0, 0, c.width, c.height), 90);
    };
    const iv = setInterval(() => { if (Math.random() < 0.55) bolt(); }, 900);
    return () => { clearInterval(iv); clearTimeout(t); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fx-lightning" />;
}

export function Confetti({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bits = useRef<any[]>([]);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext('2d')!;
    let W = 0, H = 0, raf = 0;
    const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    const loop = () => {
      x.clearRect(0, 0, W, H);
      for (const p of bits.current) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rot += 0.2; p.life--;
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = p.c;
        x.shadowBlur = 8; x.shadowColor = p.c; x.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); x.restore();
      }
      bits.current = bits.current.filter((p) => p.life > 0 && p.y < H + 20);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    if (!trigger) return;
    const C = ['#39ff8b', '#9d4edd', '#21e6ff', '#ffce4a', '#ff3ec9'];
    bits.current = Array.from({ length: 160 }, (_, i) => ({
      x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 15, vy: Math.random() * -13 - 3,
      r: Math.random() * 4 + 2, c: C[i % 5], life: 60 + Math.random() * 40, rot: Math.random() * 6,
    }));
  }, [trigger]);
  return <canvas ref={ref} className="fx-confetti" />;
}

// Drifting volumetric smoke wisps rising through the room
export function SmokeLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext('2d')!;
    let W = 0, H = 0, raf = 0;
    const puffs = Array.from({ length: 24 }, () => ({
      x: Math.random(), y: Math.random(), r: 40 + Math.random() * 80,
      sp: 0.06 + Math.random() * 0.12, drift: (Math.random() - 0.5) * 0.3,
      a: 0.03 + Math.random() * 0.06, hue: Math.random() < 0.5 ? '157,78,221' : '57,255,139',
      ph: Math.random() * 6,
    }));
    const resize = () => { W = c.width = c.offsetWidth; H = c.height = c.offsetHeight; };
    setTimeout(resize, 60); addEventListener('resize', resize);
    const loop = () => {
      x.clearRect(0, 0, W, H);
      for (const p of puffs) {
        p.y -= p.sp / 100; p.ph += 0.005;
        if (p.y < -0.1) { p.y = 1.1; p.x = Math.random(); }
        const px = (p.x + Math.sin(p.ph) * 0.04 + p.drift * p.y) * W;
        const py = p.y * H;
        const g = x.createRadialGradient(px, py, 0, px, py, p.r);
        g.addColorStop(0, `rgba(${p.hue},${p.a})`);
        g.addColorStop(1, `rgba(${p.hue},0)`);
        x.fillStyle = g; x.beginPath(); x.arc(px, py, p.r, 0, 7); x.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fx-smoke" />;
}
