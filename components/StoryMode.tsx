// components/StoryMode.tsx — Full-screen "Play your year" recap.
// An iconic, wrapped-style sequence: one stat per scene, a blown-up sport/stat motif
// behind giant type on a bold per-scene color field. The dashboard supplies the content
// (scenes); this component owns the look — palettes, motifs, and motion.

import { useEffect, useRef, useState } from 'react';
import {
  X, ChevronDown, Download,
  Sparkles, Route, Timer, TrendingUp, Gauge, Flame, Mountain,
  Footprints, Moon, Trophy, Bike, Activity, Waves, Dumbbell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as htmlToImage from 'html-to-image';

export type PaletteKey = 'ember' | 'violet' | 'abyss' | 'lime' | 'rose' | 'gold' | 'indigo';
export type MotifKey =
  | 'sparkles' | 'route' | 'timer' | 'trending' | 'gauge' | 'flame' | 'mountain'
  | 'footprints' | 'moon' | 'trophy' | 'bike' | 'run' | 'swim' | 'strength' | 'hike' | 'rower';

export type StoryStat = { label: string; value: string };

export type StoryScene = {
  key: string;
  palette: PaletteKey;
  motif: MotifKey;
  eyebrow: string;
  headline: string;
  caption?: string;
  footnote?: string;
  kind?: 'stat' | 'summary';
  stats?: StoryStat[];
};

type Palette = { bg: string; accent: string; glow: string };

const PALETTES: Record<PaletteKey, Palette> = {
  ember:  { bg: 'linear-gradient(165deg, #190a07 0%, #7c2d12 58%, #c2410c 100%)', accent: '#fdba74', glow: 'rgba(251,146,60,0.45)' },
  violet: { bg: 'linear-gradient(165deg, #0d0a2b 0%, #4c1d95 58%, #7c3aed 100%)', accent: '#c4b5fd', glow: 'rgba(167,139,250,0.45)' },
  abyss:  { bg: 'linear-gradient(165deg, #021a24 0%, #0e7490 58%, #06b6d4 100%)', accent: '#67e8f9', glow: 'rgba(34,211,238,0.40)' },
  lime:   { bg: 'linear-gradient(165deg, #0a1f0a 0%, #166534 58%, #65a30d 100%)', accent: '#bef264', glow: 'rgba(163,230,53,0.40)' },
  rose:   { bg: 'linear-gradient(165deg, #1a0712 0%, #9f1239 58%, #e11d48 100%)', accent: '#fda4af', glow: 'rgba(244,63,94,0.42)' },
  gold:   { bg: 'linear-gradient(165deg, #1a1405 0%, #a16207 58%, #eab308 100%)', accent: '#fde68a', glow: 'rgba(234,179,8,0.40)' },
  indigo: { bg: 'linear-gradient(165deg, #070b1f 0%, #1e3a8a 58%, #2563eb 100%)', accent: '#93c5fd', glow: 'rgba(59,130,246,0.42)' },
};

const MOTIF_ICONS: Record<MotifKey, LucideIcon> = {
  sparkles: Sparkles, route: Route, timer: Timer, trending: TrendingUp, gauge: Gauge,
  flame: Flame, mountain: Mountain, footprints: Footprints, moon: Moon, trophy: Trophy,
  bike: Bike, run: Activity, swim: Waves, strength: Dumbbell, hike: Mountain, rower: Waves,
};

export default function StoryMode({ scenes, onClose, fileBase = 'FitnessWrapped' }: { scenes: StoryScene[]; onClose: () => void; fileBase?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<Array<HTMLElement | null>>([]);
  const [visible, setVisible] = useState<boolean[]>(() => scenes.map(() => false));
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  // Save the scene currently in view as a PNG (the shareable artifact).
  const saveActiveScene = async () => {
    const node = sceneRefs.current[activeIdx];
    if (!node || saving) return;
    setSaving(true);
    try {
      const dataUrl = await htmlToImage.toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        width: node.offsetWidth,
        height: node.offsetHeight,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${fileBase}_${scenes[activeIdx]?.key ?? 'scene'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to save scene image', err);
    } finally {
      setSaving(false);
    }
  };

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keyboard: Escape closes; arrows / Page / Home / End move between scenes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown';
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp';
      const first = e.key === 'Home';
      const last = e.key === 'End';
      if (!fwd && !back && !first && !last) return;
      e.preventDefault();
      const target = first
        ? 0
        : last
          ? scenes.length - 1
          : back
            ? Math.max(0, activeIdx - 1)
            : Math.min(scenes.length - 1, activeIdx + 1);
      sceneRefs.current[target]?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, activeIdx, scenes.length]);

  // Move focus into the dialog on open so keyboard users start in context.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Reveal scenes as they enter; track the active one for the counter + rail.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.idx);
          if (entry.isIntersecting) {
            setVisible((prev) => (prev[idx] ? prev : prev.map((v, i) => (i === idx ? true : v))));
            if (entry.intersectionRatio >= 0.5) setActiveIdx(idx);
          }
        }
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );
    sceneRefs.current.forEach((el) => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [scenes.length]);

  const scrollToScene = (idx: number) => {
    sceneRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' });
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 bg-black text-white" role="dialog" aria-modal="true" aria-label="Your year — story mode">
      {/* Scene counter — the sequence is real, so the count is information, not decoration. */}
      <div className="fixed top-4 left-4 z-20 text-sm tracking-[0.3em] tabular-nums text-white/70">
        {pad(activeIdx + 1)} <span className="text-white/35">/ {pad(scenes.length)}</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close story"
        className="fixed top-4 right-4 z-20 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={saveActiveScene}
        disabled={saving}
        aria-label="Save this scene as an image"
        className="fixed top-4 right-[3.75rem] z-20 h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center gap-2 text-white text-xs font-medium transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save image'}</span>
      </button>

      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
        {scenes.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Go to ${s.eyebrow}`}
            onClick={() => scrollToScene(i)}
            className={`rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              i === activeIdx ? 'h-5 w-2 bg-white' : 'h-2 w-2 bg-white/35 hover:bg-white/60'
            }`}
          />
        ))}
      </div>

      <div ref={containerRef} tabIndex={-1} className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth outline-none">
        {scenes.map((s, i) => {
          const pal = PALETTES[s.palette];
          const Motif = MOTIF_ICONS[s.motif];
          const shown = visible[i];
          const corner = i % 2 === 0
            ? 'sm:left-auto sm:top-auto sm:right-[-14%] sm:bottom-[-16%]'
            : 'sm:right-auto sm:bottom-auto sm:left-[-14%] sm:top-[-14%]';
          return (
            <section
              key={s.key}
              data-idx={i}
              ref={(el) => { sceneRefs.current[i] = el; }}
              className="relative h-full snap-start snap-always flex items-center justify-center overflow-hidden"
              style={{ background: pal.bg }}
            >
              {/* Accent glow */}
              <div
                aria-hidden
                className="absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none"
                style={{ background: `radial-gradient(58% 48% at 50% 40%, ${pal.glow}, transparent 70%)`, opacity: shown ? 1 : 0 }}
              />

              {/* Blown-up motif — the signature: the sport/stat as ambient background art */}
              <div
                aria-hidden
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:translate-x-0 sm:translate-y-0 ${corner} pointer-events-none transition-all duration-[1200ms] ease-out motion-reduce:transition-none motion-reduce:opacity-[0.14] motion-reduce:scale-100 ${
                  shown ? 'opacity-[0.14] scale-100' : 'opacity-0 scale-110'
                }`}
                style={{ width: '92vmin', height: '92vmin', color: pal.accent }}
              >
                <Motif className="w-full h-full" strokeWidth={1.05} />
              </div>

              {/* Legibility scrim */}
              <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(70% 56% at 50% 50%, rgba(0,0,0,0.30), transparent 78%)' }} />

              {/* Content */}
              <div
                className={`relative z-10 w-full px-6 sm:px-8 transition-all duration-700 ease-out motion-reduce:transition-none ${
                  shown
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0'
                }`}
              >
                {s.kind === 'summary' ? (
                  <div className="mx-auto max-w-2xl text-center">
                    <p className="uppercase font-semibold" style={{ color: pal.accent, letterSpacing: '0.28em', fontSize: 'clamp(0.7rem, 2.6vw, 0.95rem)' }}>
                      {s.eyebrow}
                    </p>
                    <h2 className="mt-3 font-black text-white [text-wrap:balance]" style={{ fontSize: 'clamp(1.9rem, 8vw, 3.25rem)', letterSpacing: '-0.02em', lineHeight: 1.0 }}>
                      {s.headline}
                    </h2>
                    <div className="mt-7 grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {(s.stats ?? []).map((st) => (
                        <div key={st.label} className="rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 py-3 text-left">
                          <div className="uppercase tracking-[0.16em] text-white/55" style={{ fontSize: 'clamp(0.55rem, 1.8vw, 0.66rem)' }}>{st.label}</div>
                          <div className="mt-1 font-bold tracking-tight text-white truncate" style={{ fontSize: 'clamp(1.1rem, 5vw, 1.55rem)' }}>{st.value}</div>
                        </div>
                      ))}
                    </div>
                    {s.footnote && (
                      <p className="mt-7 text-white/75" style={{ fontSize: 'clamp(0.85rem, 3vw, 1rem)' }}>{s.footnote}</p>
                    )}
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl text-center">
                    <p className="uppercase font-semibold" style={{ color: pal.accent, letterSpacing: '0.28em', fontSize: 'clamp(0.7rem, 2.6vw, 0.95rem)' }}>
                      {s.eyebrow}
                    </p>
                    <h2 className="mt-5 font-black text-white [text-wrap:balance]" style={{ fontSize: 'clamp(2.85rem, 13vw, 7.5rem)', letterSpacing: '-0.02em', lineHeight: 0.95 }}>
                      {s.headline}
                    </h2>
                    {s.caption && (
                      <p className="mt-6 text-white/85 [text-wrap:balance]" style={{ fontSize: 'clamp(1.05rem, 4.4vw, 1.6rem)' }}>
                        {s.caption}
                      </p>
                    )}
                    {s.footnote && (
                      <p className="mt-7 uppercase font-medium" style={{ color: pal.accent, letterSpacing: '0.22em', fontSize: 'clamp(0.7rem, 2.4vw, 0.85rem)' }}>
                        {s.footnote}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {i === 0 && scenes.length > 1 && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/60 motion-safe:animate-bounce">
                  <ChevronDown className="w-6 h-6" />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
