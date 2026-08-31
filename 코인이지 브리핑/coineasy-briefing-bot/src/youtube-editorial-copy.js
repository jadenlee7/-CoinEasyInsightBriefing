function voiceCut(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/[\s,.·–—-]+$/g, '')}…`;
}

function sceneForTime(seconds) {
  if (seconds < 4) return 0;
  if (seconds < 10) return 1;
  if (seconds < 16) return 2;
  if (seconds < 22) return 3;
  if (seconds < 28) return 4;
  return 5;
}

function buildNarration(payload) {
  const narration = String(payload?.editorial?.voiceoverKo || '').replace(/\s+/g, ' ').trim();
  if (!narration) throw new Error('승인된 youtube.voiceover_ko가 없습니다.');
  return narration;
}

function assertTtsDuration(durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('TTS 음성 길이를 확인할 수 없습니다.');
  }
  if (duration > 30) {
    throw new Error(`TTS 음성이 30초를 초과했습니다 (${duration.toFixed(2)}초).`);
  }
  return duration;
}

export { assertTtsDuration, buildNarration, sceneForTime, voiceCut };
