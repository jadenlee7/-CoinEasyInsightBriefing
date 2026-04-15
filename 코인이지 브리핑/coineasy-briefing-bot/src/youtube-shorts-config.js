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
const DURATION_SECONDS = 38;   // 30-45 s sweet-spot for Shorts
const FRAME_RATE       = 30;   // fps

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
const TTS_RATE     = '+0%';                  // normal speed
const TTS_VOLUME   = '+0%';

// ─── Design tokens (match existing banner palette) ───────
const COLORS = {
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
