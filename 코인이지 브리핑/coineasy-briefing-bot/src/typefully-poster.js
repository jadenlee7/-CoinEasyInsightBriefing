/**
 * 코인이지 데일리 브리핑 - Typefully API v2 멀티플랫폼 포스팅 모듈
 * Typefully API를 통해 X, LinkedIn, Threads에 동시 자동 포스팅
 *
 * 환경변수:
 *   TYPEFULLY_API_KEY       - Typefully Bearer 토큰
 *   TYPEFULLY_SOCIAL_SET_ID - Social Set ID (GET /v2/social-sets 로 확인)
 *   TELEGRAM_GROWTH_X_BRIEFING_AM_URL - 승인된 아침 X → Telegram deep link
 *   TELEGRAM_GROWTH_X_BRIEFING_PM_URL - 승인된 저녁 X → Telegram deep link
 */

// Using global fetch (Node 18+)

const API_BASE = 'https://api.typefully.com';
const DEFAULT_PUBLISH_DELAY_MS = 60_000;
const URL_PUBLISH_DELAY_MS = 15 * 60_000;
const TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE = Object.freeze({
    morning: Object.freeze({
        creative: 'briefing_am',
        envName: 'TELEGRAM_GROWTH_X_BRIEFING_AM_URL',
        url: 'https://t.me/coineasy_insight_bot?start=join_x_briefing_am',
        lead: '오늘 아침 시장 해석, 코인이지 소통방에서 바로 이어서 이야기해요.',
    }),
    evening: Object.freeze({
        creative: 'briefing_pm',
        envName: 'TELEGRAM_GROWTH_X_BRIEFING_PM_URL',
        url: 'https://t.me/coineasy_insight_bot?start=join_x_briefing_pm',
        lead: '오늘 저녁 시장 해석, 코인이지 소통방에서 바로 이어서 이야기해요.',
    }),
});
const CANONICAL_TELEGRAM_GROWTH_URLS = Object.freeze(
    Object.fromEntries(
        Object.entries(TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE)
            .map(([type, config]) => [type, config.url])
    )
);
const TELEGRAM_GROWTH_URL_ENVS = Object.freeze(
    Object.fromEntries(
        Object.entries(TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE)
            .map(([type, config]) => [type, config.envName])
    )
);

function canonicalTelegramGrowthReplyText(briefingType) {
    const config = TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE[briefingType];
    if (!config) throw new Error('invalid_briefing_type');
    return `${config.lead}\n\n원탭 입장 👇\n${config.url}`;
}

/**
 * Resolve the operator-owned X acquisition link.
 *
 * The exact URL is intentionally allowlisted. A missing value, typo, alternate
 * bot, redirect, or undeployed creative must not leak into a public draft.
 * Existing root posts still publish when this optional CTA fails closed.
 */
function resolveTelegramGrowthXReply(briefingType, env = process.env) {
    const config = TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE[briefingType];
    if (!config) {
        return { enabled: false, reason: 'invalid_briefing_type', text: null };
    }

    const configuredUrl = String(env[config.envName] || '').trim();
    if (!configuredUrl) {
        return { enabled: false, reason: 'missing_canonical_url', text: null };
    }
    if (configuredUrl !== config.url) {
        return { enabled: false, reason: 'invalid_canonical_url', text: null };
    }
    return {
        enabled: true,
        reason: null,
        creative: config.creative,
        text: canonicalTelegramGrowthReplyText(briefingType),
    };
}

function normalizedCanonicalXReply(xReplyText) {
    const allowedReplies = Object.keys(TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE)
        .map(canonicalTelegramGrowthReplyText);
    return allowedReplies.includes(xReplyText) ? xReplyText : null;
}

function buildPlatformsPayload(text, options = {}) {
    const {
        platforms = ['x', 'linkedin', 'threads'],
        mediaIds = null,
        xReplyText = null,
    } = options;
    const canonicalXReply = normalizedCanonicalXReply(xReplyText);
    const platformsPayload = {};

    for (const platform of platforms) {
        const primaryPost = { text };
        if (mediaIds && mediaIds.length > 0) {
            // v1 API returns URL strings, v2 returns IDs.
            if (typeof mediaIds[0] === 'string' && mediaIds[0].startsWith('http')) {
                primaryPost.media_urls = mediaIds;
            } else {
                primaryPost.media_ids = mediaIds;
            }
        }

        const posts = [primaryPost];
        if (platform === 'x' && canonicalXReply) {
            // Keep the root post link-free. Only X receives the acquisition reply.
            posts.push({ text: canonicalXReply });
        }
        platformsPayload[platform] = { enabled: true, posts };
    }

    return platformsPayload;
}

function payloadContainsUrl(platformsPayload) {
    return Object.values(platformsPayload).some(platform =>
        platform.posts.some(post => /https?:\/\//i.test(post.text || ''))
    );
}

function resolvePublishAt(publishAt, options = {}) {
    const {
        containsUrl = false,
        nowMs = Date.now(),
    } = options;
    const parsedNowMs = Number(nowMs);
    if (!Number.isFinite(parsedNowMs)) {
        throw new Error('invalid_publish_clock');
    }

    let requestedMs;
    if (publishAt == null) {
        requestedMs = parsedNowMs + DEFAULT_PUBLISH_DELAY_MS;
    } else {
        requestedMs = Date.parse(publishAt);
        if (!Number.isFinite(requestedMs)) {
            throw new Error('invalid_publish_at');
        }
    }

    if (containsUrl) {
        requestedMs = Math.max(requestedMs, parsedNowMs + URL_PUBLISH_DELAY_MS);
    }
    return new Date(requestedMs).toISOString();
}

function buildTypefullyDraftPayload(text, options = {}) {
    const {
        platforms = ['x', 'linkedin', 'threads'],
        publishAt = null,
        draftTitle = null,
        mediaIds = null,
        xReplyText = null,
        nowMs = Date.now(),
    } = options;
    const platformsPayload = buildPlatformsPayload(text, {
        platforms,
        mediaIds,
        xReplyText,
    });
    const body = {
        platforms: platformsPayload,
        publish_at: resolvePublishAt(publishAt, {
            containsUrl: payloadContainsUrl(platformsPayload),
            nowMs,
        }),
    };

    if (draftTitle) {
        body.draft_title = draftTitle;
    }
    return body;
}

// ============================================================
// Typefully API 헬퍼
// ============================================================

function getHeaders() {
    const apiKey = process.env.TYPEFULLY_API_KEY;
    if (!apiKey) {
          throw new Error('TYPEFULLY_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
    };
}

function getSocialSetId() {
    const id = process.env.TYPEFULLY_SOCIAL_SET_ID;
    if (!id) {
          throw new Error('TYPEFULLY_SOCIAL_SET_ID 환경변수가 설정되지 않았습니다. GET /v2/social-sets 로 확인하세요.');
    }
    return id;
}

// ============================================================
// Social Set 목록 조회 (초기 설정용)
// ============================================================

async function listSocialSets() {
    const res = await fetch(`${API_BASE}/v2/social-sets`, {
          method: 'GET',
          headers: getHeaders(),
    });

  if (!res.ok) {
        const body = await res.text();
        throw new Error(`Social Sets 조회 실패 (${res.status}): ${body}`);
  }

  return res.json();
}

// ============================================================
// Typefully 드래프트 생성 + 예약 발행 (X, LinkedIn, Threads)
// ============================================================

async function postToSocial(text, options = {}) {
    const {
          platforms = ['x', 'linkedin', 'threads'],
          publishAt = null,             // ISO날짜 | null(기본 1분, URL이 있으면 최소 15분)
          draftTitle = null,
          mediaIds = null,             // 미디어 ID 배열 (Typefully 업로드 후)
          xReplyText = null,           // canonical Telegram CTA; X에만 추가
          nowMs = Date.now(),          // deterministic payload tests
    } = options;

  const socialSetId = getSocialSetId();
  const body = buildTypefullyDraftPayload(text, {
        platforms,
        publishAt,
        draftTitle,
        mediaIds,
        xReplyText,
        nowMs,
  });
  const publishAtIso = body.publish_at;

  const enabledPlatforms = platforms.join(', ');
    console.log(`[Typefully] 포스팅 중... (${enabledPlatforms}) | ${text.length}자 | publish_at: ${publishAtIso}`);

  const res = await fetch(`${API_BASE}/v2/social-sets/${socialSetId}/drafts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
  });

  if (!res.ok) {
        const errBody = await res.text();
        console.error(`[Typefully 에러] ${res.status}: ${errBody}`);
        return {
                success: false,
                error: `API ${res.status}: ${errBody}`,
                status: res.status,
        };
  }

  const data = await res.json();

  console.log(`[Typefully] 성공! Draft ID: ${data.id} | Status: ${data.status}`);

  if (data.x_published_url) {
        console.log(`  → X: ${data.x_published_url}`);
  }
    if (data.linkedin_published_url) {
          console.log(`  → LinkedIn: ${data.linkedin_published_url}`);
    }
    if (data.threads_published_url) {
          console.log(`  → Threads: ${data.threads_published_url}`);
    }

  return {
        success: true,
        draftId: data.id,
        status: data.status,
        xUrl: data.x_published_url || null,
        linkedinUrl: data.linkedin_published_url || null,
        threadsUrl: data.threads_published_url || null,
  };
}

// ============================================================
// 미디어 업로드 (배너 이미지 등)
// ============================================================

async function uploadMedia(imageBuffer, filename = 'banner.png') {
    const socialSetId = getSocialSetId();
    const apiKey = process.env.TYPEFULLY_API_KEY;
    if (!apiKey) throw new Error('TYPEFULLY_API_KEY 환경변수 미설정');

    const mimeType = filename.endsWith('.jpg') || filename.endsWith('.jpeg')
        ? 'image/jpeg' : 'image/png';

    console.log(`[Typefully] 미디어 업로드 시작: ${filename} (${Math.round(imageBuffer.length / 1024)}KB)`);

    try {
        // Step 1: presigned upload URL 요청 (Typefully API v2)
        const step1Res = await fetch(`${API_BASE}/v2/social-sets/${socialSetId}/media/upload`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ file_name: filename }),
        });

        if (step1Res.status !== 201) {
            const errText = await step1Res.text().catch(() => '');
            console.warn(`[Typefully] presigned URL 요청 실패 (${step1Res.status}): ${errText}`);
            return null;
        }

        const { media_id: mediaId, upload_url: uploadUrl } = await step1Res.json();
        console.log(`[Typefully] media_id 획득: ${mediaId}`);

        // Step 2: S3에 직접 PUT (presigned URL이 모든 서명 포함, 추가 헤더 X)
        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: imageBuffer,
        });

        if (!uploadRes.ok) {
            console.warn(`[Typefully] S3 PUT 실패 (${uploadRes.status})`);
            return null;
        }
        console.log(`[Typefully] S3 업로드 완료, processing 대기 중...`);

        // Step 3: media status 폴링 (최대 60초, 2초 간격)
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await fetch(`${API_BASE}/v2/social-sets/${socialSetId}/media/${mediaId}`, {
                method: 'GET',
                headers: getHeaders(),
            });
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            if (statusData.status === 'ready') {
                console.log(`[Typefully] 미디어 ready! ID: ${mediaId}`);
                return mediaId;
            }
            if (statusData.status === 'failed') {
                console.warn(`[Typefully] 미디어 처리 실패: ${statusData.error_reason || 'unknown'}`);
                return null;
            }
        }
        console.warn(`[Typefully] 미디어 ready 타임아웃 (60초)`);
        return null;
    } catch (e) {
        console.warn(`[Typefully] 업로드 에러: ${e.message}`);
        return null;
    }
}

// ============================================================
// 편의 함수: 텍스트 + 배너 이미지 → 소셜 포스팅
// ============================================================

async function postBriefingToSocial(
    text,
    bannerBuffer = null,
    publishAt = null,
    briefingType = null
) {
    try {
      let mediaIds = null;

      // 배너 이미지 업로드 (presigned S3 → fallback base64)
      if (bannerBuffer) {
              const mediaId = await uploadMedia(bannerBuffer, 'briefing-banner.png');
              if (mediaId) {
                        mediaIds = [mediaId];
              }
      }

      const growthReply = resolveTelegramGrowthXReply(briefingType);
      if (growthReply.enabled) {
              console.log(`[Typefully] X Telegram CTA 활성: ${growthReply.creative} (마지막 답글)`);
      } else {
              console.warn(`[Typefully] X Telegram CTA 생략: ${growthReply.reason}`);
      }

      const result = await postToSocial(text, {
              platforms: ['x', 'linkedin', 'threads'],
              // URL이 포함되면 payload builder가 최소 15분 후로 보정한다.
              publishAt,
              draftTitle: `코인이지 데일리 브리핑 ${new Date().toISOString().slice(0, 10)}`,
              mediaIds,
              xReplyText: growthReply.text,
      });

      return {
              ...result,
              xTelegramCtaIncluded: Boolean(result.success && growthReply.enabled),
              xTelegramCtaReason: growthReply.reason,
              xTelegramCreative: growthReply.enabled ? growthReply.creative : null,
      };

    } catch (err) {
          console.error(`[Typefully 포스팅 에러] ${err.message}`);
          return {
                  success: false,
                  error: err.message,
          };
    }
}

export {
  CANONICAL_TELEGRAM_GROWTH_URLS,
  DEFAULT_PUBLISH_DELAY_MS,
  TELEGRAM_GROWTH_CONFIG_BY_BRIEFING_TYPE,
  TELEGRAM_GROWTH_URL_ENVS,
  URL_PUBLISH_DELAY_MS,
  buildPlatformsPayload,
  buildTypefullyDraftPayload,
  canonicalTelegramGrowthReplyText,
  postToSocial,
  uploadMedia,
  postBriefingToSocial,
  resolvePublishAt,
  resolveTelegramGrowthXReply,
  listSocialSets
};
