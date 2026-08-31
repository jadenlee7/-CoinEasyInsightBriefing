const SCENE_DURATIONS = Object.freeze([4, 6, 6, 6, 6, 4]);
const SCENE_STARTS = Object.freeze([0, 4, 10, 16, 22, 28]);

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

function buildNarrationSegments(payload) {
  const segments = payload?.editorial?.voiceoverSegmentsKo;
  if (!Array.isArray(segments) || segments.length !== 6) {
    throw new Error('승인된 youtube.voiceover_segments_ko 6개가 필요합니다.');
  }
  const normalized = segments.map((value) => {
    if (typeof value !== 'string') throw new Error('장면별 음성 원고는 문자열이어야 합니다.');
    return value.replace(/\s+/g, ' ').trim();
  });
  if (normalized.slice(0, 5).some((value) => !value) || normalized[5] !== '') {
    throw new Error('처음 5개 장면은 음성이 필요하고 마지막 CTA 장면은 무음이어야 합니다.');
  }
  if (normalized.filter(Boolean).join(' ') !== buildNarration(payload)) {
    throw new Error('장면별 음성 합계가 승인된 youtube.voiceover_ko와 다릅니다.');
  }
  return normalized;
}

function assertSceneTtsDurations(durations) {
  if (!Array.isArray(durations) || durations.length !== 5) {
    throw new Error('처음 5개 장면의 실제 TTS 길이가 필요합니다.');
  }
  const speech = durations.map((seconds, index) => {
    const duration = assertTtsDuration(seconds);
    if (duration > SCENE_DURATIONS[index] - 0.25) {
      throw new Error(`장면 ${index + 1} TTS가 승인된 장면 시간에 맞지 않습니다 (${duration.toFixed(2)}초).`);
    }
    return { scene: index + 1, start_seconds: SCENE_STARTS[index], duration_seconds: duration };
  });
  assertTtsDuration(SCENE_STARTS[4] + speech[4].duration_seconds);
  return speech;
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

export {
  assertTtsDuration, assertSceneTtsDurations, buildNarration, buildNarrationSegments,
  sceneForTime, voiceCut, SCENE_DURATIONS, SCENE_STARTS,
};
