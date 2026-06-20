// components/ig/config.ts — Static Instagram-carousel configuration.
// Hoisted to module scope so these objects aren't reallocated on every render.

export type IGFormat = 'portrait45' | 'portrait34' | 'square';
export type IGSlideKey = 'cover' | 'distance' | 'time' | 'steps' | 'sleep' | 'longest' | 'calories' | 'elevation';
export type IGThemeKey = 'midnight' | 'sunset' | 'ocean' | 'neon';

export const IG_FORMATS: Record<IGFormat, { label: string; w: number; h: number }> = {
  portrait45: { label: 'Portrait 4:5 (1080×1350) — recommended', w: 1080, h: 1350 },
  portrait34: { label: 'Portrait 3:4 (1080×1440)', w: 1080, h: 1440 },
  square: { label: 'Square 1:1 (1080×1080)', w: 1080, h: 1080 },
};

export const IG_COVER_TAGLINES = [
  'A whole year, distilled into vibes.',
  'Your year in motion — no receipts required.',
  'Proof you did the thing (repeatedly).',
  'Stats, but make it a glow‑up.',
  'A highlight reel for your legs.',
  'Consistency called. You answered.',
  'Annual report, but fun.',
] as const;

export const IG_THEMES: Record<IGThemeKey, { label: string; bg: string; accent: string; card: string; muted: string }> = {
  midnight: {
    label: 'Midnight',
    bg: 'linear-gradient(135deg, #050505 0%, #111827 55%, #0b1020 100%)',
    accent: '#a78bfa',
    card: 'rgba(255,255,255,0.06)',
    muted: 'rgba(255,255,255,0.70)',
  },
  sunset: {
    label: 'Sunset',
    bg: 'linear-gradient(135deg, #0b1020 0%, #7c2d12 55%, #111827 100%)',
    accent: '#fb7185',
    card: 'rgba(255,255,255,0.07)',
    muted: 'rgba(255,255,255,0.72)',
  },
  ocean: {
    label: 'Ocean',
    bg: 'linear-gradient(135deg, #001b2e 0%, #0e7490 55%, #0b1020 100%)',
    accent: '#22d3ee',
    card: 'rgba(255,255,255,0.07)',
    muted: 'rgba(255,255,255,0.72)',
  },
  neon: {
    label: 'Neon',
    bg: 'linear-gradient(135deg, #050505 0%, #052e16 55%, #0b1020 100%)',
    accent: '#34d399',
    card: 'rgba(255,255,255,0.06)',
    muted: 'rgba(255,255,255,0.70)',
  },
};

export const IG_TAGLINES: Record<IGSlideKey, string[]> = {
  cover: [...IG_COVER_TAGLINES],
  distance: [
    'You basically explored the map.',
    'Mileage? Yes.',
    'Your shoes asked for a raise.',
    'If “out for a bit” was a lifestyle.',
    'Frequent flyer, but on foot.',
  ],
  time: [
    'Time well spent (and then some).',
    'Hours on the move. Zero regrets.',
    'You kept showing up.',
    'Clocked in. Clocked out. Repeat.',
    'That’s a lot of “just one more.”',
  ],
  steps: [
    'Your feet were booked and busy.',
    'Walking is the original superpower.',
    'Step count said: “let’s go.”',
    'Tiny strides. Big year.',
    'Putting miles on the pavement.',
  ],
  sleep: [
    'Recovery arc: progressing.',
    'You earned those Z’s.',
    'Sleep is a sport too.',
    'Rest days, but nightly.',
    'Dream big. Recover bigger.',
  ],
  longest: [
    'The main event.',
    'You were OUT there.',
    'This one had a soundtrack.',
    'Endurance flex detected.',
    'A proper mission.',
  ],
  calories: [
    'Kitchen officially earned.',
    'You turned snacks into stats.',
    'Certified furnace behavior.',
    'Fuel in, watts out.',
    'Suffering, but make it numbers.',
  ],
  elevation: [
    'You chased the skyline.',
    'Gravity tried. You didn’t care.',
    'Up is a direction — you chose it.',
    'Altitude attitude.',
    'Peak pursuits only.',
  ],
};

export const THEME_BY_SLIDE: Record<IGSlideKey, IGThemeKey> = {
  cover: 'midnight',
  distance: 'ocean',
  time: 'sunset',
  steps: 'neon',
  sleep: 'midnight',
  longest: 'sunset',
  calories: 'neon',
  elevation: 'ocean',
};
