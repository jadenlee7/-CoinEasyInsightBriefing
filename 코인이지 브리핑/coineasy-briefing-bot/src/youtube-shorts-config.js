// src/youtube-shorts-config.js
// ============================
// Configuration constants for YouTube Shorts video generation.
// All video parameters are centralised here so they can be tuned
// without touching the generator or uploader logic.



// ─── Video dimensions (9:16 vertical) ───────────────────
export const VIDEO_WIDTH  = 1080;
export const VIDEO_HEIGHT = 1920;

// ─── Timing ─────────────────────────────────────────────
export const DURATION_SECONDS = 38;   // 30-45 s sweet-spot for Shorts
export const FRAME_RATE       = 30;   // fps

// ─── Encoding ────────────────────────────────────────────
export const VIDEO_BITRATE = '5000k';
export const AUDIO_BITRATE = '128k';
export const VIDEO_CODEC   = 'libx264';
export const AUDIO_CODEC   = 'aac';
export const PIXEL_FORMAT  = 'yuv420p';   // required for broad compatibility
export const PRESET        = 'fast';      // encoding speed vs. file-size trade-off
export const CRF           = 23;          // constant rate factor (lower = better quality)

// ─── Output ──────────────────────────────────────────────
export const OUTPUT_FORMAT = 'mp4';
export const OUTPUT_DIR    = '/tmp/youtube-shorts';  // ephemeral; cleaned up after upload

// ─── Text-to-speech (edge-tts) ───────────────────────────
export const TTS_VOICE    = 'ko-KR-SunHiNeural';   // Korean female voice
export const TTS_RATE     = '+0%';                  // normal speed
export const TTS_VOLUME   = '+0%';

// ─── Design tokens (match existing banner palette) ───────
export const COLORS = {
  bg:          '#1a0f00',   // very dark brown — Shorts background
  bgCard:      '#2a1a0a',   // card background
  bullGreen:   '#00b009',
  bearRed:     '#ff1f1f',
  white:       '#ffffff',
  cream:       '#fff8e7',
  yellow:      '#ffd600',
  orange:      '#ff6d00',
  gray:        '#aaaaaa',
  overlayDark: 'rgba(0,0,0,0.55)',
};

// ─── Animation timings (seconds) ─────────────────────────
export const ANIM = {
  fadeInDuration:  0.5,
  fadeOutStart:    DURATION_SECONDS - 1.0,
  fadeOutDuration: 1.0,
  slideInDelay:    0.3,
};

// ─── YouTube upload defaults ──────────────────────────────
export const YT_DEFAULT_TAGS = [
  '코인이지', 'CoinEasy', '비트코인', 'BTC', '암호화폐', '크립토',
  '코인시황', '데일리브리핑', '유튜브쇼츠', 'Shorts',
];

export const YT_CATEGORY_ID = '27';   // News & Politics (Finance is not a standalone category)
export const YT_LANGUAGE    = 'ko';
export const YT_PRIVACY     = process.env.YT_PRIVACY_STATUS || 'public';

