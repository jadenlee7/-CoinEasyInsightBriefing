/**
 * 코인이지 데일리 브리핑 - Typefully API v2 멀티플랫폼 포스팅 모듈
 * Typefully API를 통해 X, LinkedIn, Threads에 동시 자동 포스팅
 *
 * 환경변수:
 *   TYPEFULLY_API_KEY       - Typefully Bearer 토큰
 *   TYPEFULLY_SOCIAL_SET_ID - Social Set ID (GET /v2/social-sets 로 확인)
 */

// Using global fetch (Node 18+)

const API_BASE = 'https://api.typefully.com';

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
// Typefully 드래프트 생성 + 즉시 발행 (X, LinkedIn, Threads)
// ============================================================

async function postToSocial(text, options = {}) {
    const {
          platforms = ['x', 'linkedin', 'threads'],
          publishAt = 'now',           // 'now' | 'next-free-slot' | ISO날짜 | null(초안)
          draftTitle = null,
          mediaIds = null,             // 미디어 ID 배열 (Typefully 업로드 후)
    } = options;

  const socialSetId = getSocialSetId();

  // 플랫폼별 posts 구성
  const platformsPayload = {};

  for (const platform of platforms) {
        const post = { text };
        if (mediaIds && mediaIds.length > 0) {
                post.media_ids = mediaIds;
        }
        platformsPayload[platform] = {
                enabled: true,
                posts: [post],
        };
  }

  const body = {
        platforms: platformsPayload,
        publish_at: publishAt,
  };

  if (draftTitle) {
        body.draft_title = draftTitle;
  }

  const enabledPlatforms = platforms.join(', ');
    console.log(`[Typefully] 포스팅 중... (${enabledPlatforms}) | ${text.length}자 | publish_at: ${publishAt}`);

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

  if (!apiKey) {
        throw new Error('TYPEFULLY_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // Base64 인코딩
  const base64 = imageBuffer.toString('base64');
    const mimeType = filename.endsWith('.jpg') || filename.endsWith('.jpeg')
      ? 'image/jpeg'
          : 'image/png';

  const body = {
        file: `data:${mimeType};base64,${base64}`,
        filename: filename,
  };

  console.log(`[Typefully] 미디어 업로드 중... (${filename}, ${Math.round(imageBuffer.length / 1024)}KB)`);

  const res = await fetch(`${API_BASE}/v2/social-sets/${socialSetId}/media`, {
        method: 'POST',
        headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
  });

  if (!res.ok) {
        const errBody = await res.text();
        console.error(`[Typefully 미디어 에러] ${res.status}: ${errBody}`);
        return null;
  }

  const data = await res.json();
    console.log(`[Typefully] 미디어 업로드 성공! Media ID: ${data.id}`);
    return data.id;
}

// ============================================================
// 편의 함수: 텍스트 + 배너 이미지 → 소셜 포스팅
// ============================================================

async function postBriefingToSocial(text, bannerBuffer = null) {
    try {
          let mediaIds = null;

      // 배너 이미지가 있으면 먼저 업로드
      if (bannerBuffer) {
              const mediaId = await uploadMedia(bannerBuffer, 'briefing-banner.png');
              if (mediaId) {
                        mediaIds = [mediaId];
              } else {
                        console.warn('[Typefully] 배너 업로드 실패 - 텍스트만 포스팅합니다.');
              }
      }

      const result = await postToSocial(text, {
              platforms: ['x', 'linkedin', 'threads'],
              publishAt: 'now',
              draftTitle: `코인이지 데일리 브리핑 ${new Date().toISOString().slice(0, 10)}`,
              mediaIds: mediaIds,
      });

      return result;

    } catch (err) {
          console.error(`[Typefully 포스팅 에러] ${err.message}`);
          return {
                  success: false,
                  error: err.message,
          };
    }
}

export {
  postToSocial,
  uploadMedia,
  postBriefingToSocial,
  listSocialSets
};