import { useCallback, useEffect, useRef, useState } from 'react';

// All SFX live in /public/assets/sfx. Add a name here + drop the file to extend.
export const SFX = {
  chip_slide: '/assets/sfx/chip_slide.wav',
  chip_land: '/assets/sfx/chip_land.wav',
  pot_collect: '/assets/sfx/pot_collect.wav',
  card_flip: '/assets/sfx/card_flip.wav',
  achievement_unlock: '/assets/sfx/achievement_unlock.wav',
  all_in_stinger: '/assets/sfx/all_in_stinger.wav',
} as const;
export type SfxName = keyof typeof SFX;

// Master volume cap. Individual sounds can be quieter via PER_SOUND_GAIN.
export const MASTER_VOLUME = 0.4; // keep it gentle — never loud
const PER_SOUND_GAIN: Partial<Record<SfxName, number>> = {
  chip_slide: 0.5,
  chip_land: 0.7,
  card_flip: 0.45,
  all_in_stinger: 0.8,
  pot_collect: 0.8,
  achievement_unlock: 0.7,
};

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(true);
  const buffers = useRef<Partial<Record<SfxName, AudioBuffer>>>({});
  const ctxRef = useRef<AudioContext | null>(null);
  const resumed = useRef(false);

  // Create the context + decode all buffers up front. Creating a (suspended)
  // AudioContext and decoding audio does NOT require a gesture — only *playback* does.
  useEffect(() => {
    let cancelled = false;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      ctxRef.current = ctx;
      (Object.keys(SFX) as SfxName[]).forEach(async (name) => {
        try {
          const res = await fetch(SFX[name]);
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          if (!cancelled) buffers.current[name] = buf;
        } catch { /* missing file is non-fatal */ }
      });
    } catch { /* no audio support */ }
    return () => { cancelled = true; };
  }, []);

  // Resume the context on the first user gesture (the browser unlock requirement).
  const resume = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || resumed.current) return;
    try { if (ctx.state === 'suspended') await ctx.resume(); resumed.current = true; } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onFirst = () => { resume(); window.removeEventListener('pointerdown', onFirst); };
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => window.removeEventListener('pointerdown', onFirst);
  }, [resume]);

  const play = useCallback((name: SfxName) => {
    if (!enabled) return;
    const ctx = ctxRef.current;
    const buf = buffers.current[name];
    if (!ctx || !buf) return;
    if (ctx.state === 'suspended') { void ctx.resume(); } // best-effort unlock
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = MASTER_VOLUME * (PER_SOUND_GAIN[name] ?? 1);
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch { /* ignore transient playback errors */ }
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((e) => {
      const next = !e;
      if (next) resume();
      return next;
    });
  }, [resume]);

  return { enabled, toggle, play };
}
