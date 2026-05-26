// Chrome tokens for the map overlays (cards, scrubber, legend). Translucent so the
// living map shows through, hairline borders, soft shadow — the same restrained
// Nordic language as the settings screen, tuned to float over a map that darkens.
export const mapTheme = {
  cardBg: 'rgba(252,252,254,0.90)',
  cardBorder: 'rgba(17,24,28,0.08)',
  text: '#11181c',
  textMuted: '#5b6470',
  accent: '#0a7ea4',
  accentSoft: '#e6f3f7',
  track: 'rgba(17,24,28,0.12)',
  trackFill: 'rgba(10,126,164,0.35)',
  thumb: '#ffffff',
  shadow: '#0b1220',
  // Glass surface tokens. On iOS 26+ the surfaces are native Liquid Glass
  // (expo-glass-effect), so these only style the fallback used on Android and
  // older iOS — a translucent fill with a soft white rim that reads as glass
  // over both the bright day map and the darkened night map.
  glassFallback: 'rgba(250,251,253,0.85)',
  glassBorder: 'rgba(255,255,255,0.55)',
} as const;
