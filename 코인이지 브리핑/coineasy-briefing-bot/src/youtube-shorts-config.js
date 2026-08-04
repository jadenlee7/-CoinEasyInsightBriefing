// src/youtube-shorts-config.js
// ============================
// Configuration constants for YouTube Shorts video generation.
// All video parameters are centralised here so they can be tuned
// without touching the generator or uploader logic.

// ESM mode (no 'use strict' needed)

// ─── Video dimensions (9:16 vertical) ───────────────────
const VIDEO_WIDTH  = 1080;
const VIDEO_HEIGHT = 1920;

// ─── Timing ─────────────────────────────────────────────
const DURATION_SECONDS = 32;   // one claim + evidence + action
const FRAME_RATE       = 24;   // smooth motion with faster daily rendering

// ─── Encoding ────────────────────────────────────────────
const VIDEO_BITRATE = '5000k';
const AUDIO_BITRATE = '128k';
const VIDEO_CODEC   = 'libx264';
const AUDIO_CODEC   = 'aac';
const PIXEL_FORMAT  = 'yuv420p';   // required for broad compatibility
const PRESET        = 'fast';      // encoding speed vs. file-size trade-off
const CRF           = 23;          // constant rate factor (lower = better quality)

// ─── Output ──────────────────────────────────────────────
const OUTPUT_FORMAT = 'mp4';
const OUTPUT_DIR    = '/tmp/youtube-shorts';  // ephemeral; cleaned up after upload

// ─── Text-to-speech (edge-tts) ───────────────────────────
const TTS_VOICE    = 'ko-KR-SunHiNeural';   // Korean female voice
const TTS_RATE     = '+18%';                 // concise editorial read
const TTS_VOLUME   = '+0%';

// ─── CoinEasy 2026 brand tokens ─────────────────────
const COLORS = {
  bg:          '#FFFBF6',
  bgCard:      '#FFF8F0',
  ink:         '#231F1A',
  muted:       '#6B6259',
  bullGreen:   '#00b009',
  bearRed:     '#ff1f1f',
  white:       '#ffffff',
  cream:       '#FFF8F0',
  yellow:      '#FFB25E',
  orange:      '#FF6B17',
  gray:        '#6B6259',
  overlayDark: 'rgba(0,0,0,0.55)',
};

// ─── Animation timings (seconds) ─────────────────────────
const ANIM = {
  fadeInDuration:  0.5,
  fadeOutStart:    DURATION_SECONDS - 1.0,
  fadeOutDuration: 1.0,
  slideInDelay:    0.3,
};

// ─── YouTube upload defaults ──────────────────────────────
const YT_DEFAULT_TAGS = [
  '코인이지', 'CoinEasy', '비트코인', 'BTC', '암호화폐', '크립토',
  '코인시황', '데일리브리핑', '유튜브쇼츠', 'Shorts',
];

const YT_CATEGORY_ID = '27';   // News & Politics (Finance is not a standalone category)
const YT_LANGUAGE    = 'ko';
const YT_PRIVACY     = process.env.YT_PRIVACY_STATUS || 'public';

export {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  DURATION_SECONDS,
  FRAME_RATE,
  VIDEO_BITRATE,
  AUDIO_BITRATE,
  VIDEO_CODEC,
  AUDIO_CODEC,
  PIXEL_FORMAT,
  PRESET,
  CRF,
  OUTPUT_FORMAT,
  OUTPUT_DIR,
  TTS_VOICE,
  TTS_RATE,
  TTS_VOLUME,
  COLORS,
  ANIM,
  YT_DEFAULT_TAGS,
  YT_CATEGORY_ID,
  YT_LANGUAGE,
  YT_PRIVACY,
};
