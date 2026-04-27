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
          publishAt = null,             // ISO날짜 | null(즉시 발행)
          draftTitle = null,
          mediaIds = null,             // 미디어 ID 배열 (Typefully 업로드 후)
    } = options;

  const socialSetId = getSocialSetId();

  // 플랫폼별 posts 구성
  const platformsPayload = {};

  for (const platform of platforms) {
        const post = { text };
        if (mediaIds && mediaIds.length > 0) {
                // v1 API returns URL strings, v2 returns IDs
                if (typeof mediaIds[0] === 'string' && mediaIds[0].startsWith('http')) {
                        post.media_urls = mediaIds;
                } else {
                        post.media_ids = mediaIds;
                }
        }
        platformsPayload[platform] = {
                enabled: true,
                posts: [post],
        };
  }

  // schedule_date: ISO 8601 (즉시 발행 = 1분 후)
  const scheduleDate = publishAt || new Date(Date.now() + 60 * 1000).toISOString();

  const body = {
        platforms: platformsPayload,
        schedule_date: scheduleDate,
  };

  if (draftTitle) {
        body.draft_title = draftTitle;
  }

  const enabledPlatforms = platforms.join(', ');
    console.log(`[Typefully] 포스팅 중... (${enabledPlatforms}) | ${text.length}자 | schedule_date: ${scheduleDate}`);

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

    console.log(`[Typefully] 미디어 업로드 중... (${filename}, ${Math.round(imageBuffer.length / 1024)}KB)`);

    // 방법 1: Typefully v1 API (multipart/form-data)
    try {
          const blob = new Blob([imageBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append('image', blob, filename);

          const v1Res = await fetch(`${API_BASE}/v1/image-upload`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${apiKey}` },
                  body: formData,
          });

          if (v1Res.ok) {
                  const v1Data = await v1Res.json();
                  const mediaUrl = v1Data.url || v1Data.image_url;
                  console.log(`[Typefully] v1 이미지 업로드 성공: ${mediaUrl}`);
                  return mediaUrl;  // v1은 URL을 반환
          }
          console.warn(`[Typefully] v1 업로드 실패 (${v1Res.status})`);
    } catch (e1) {
          console.warn(`[Typefully] v1 업로드 에러: ${e1.message}`);
    }

    // 방법 2: presigned S3 URL
    try {
          const presignRes = await fetch(`${API_BASE}/v2/social-sets/${socialSetId}/presigned-upload-url`, {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify({ filename, content_type: mimeType }),
          });

          if (presignRes.ok) {
                  const presignData = await presignRes.json();
                  const uploadUrl = presignData.upload_url || presignData.url;
                  const mediaId = presignData.media_id || presignData.id;

                  if (uploadUrl) {
                          const uploadRes = await fetch(uploadUrl, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': mimeType },
                                  body: imageBuffer,
                          });
                          if (uploadRes.ok) {
                                  console.log(`[Typefully] presigned 업로드 성공! ID: ${mediaId}`);
                                  return mediaId;
                          }
                  }
          }
          console.warn(`[Typefully] presigned 업로드 실패`);
    } catch (e2) {
          console.warn(`[Typefully] presigned 에러: ${e2.message}`);
    }

    console.warn('[Typefully] 모든 미디어 업로드 실패 — 텍스트만 포스팅');
    return null;
}

// ============================================================
// 편의 함수: 텍스트 + 배너 이미지 → 소셜 포스팅
// ============================================================

async function postBriefingToSocial(text, bannerBuffer = null) {
    try {
      let mediaIds = null;

      // 배너 이미지 업로드 (presigned S3 → fallback base64)
      if (bannerBuffer) {
              const mediaId = await uploadMedia(bannerBuffer, 'briefing-banner.png');
              if (mediaId) {
                        mediaIds = [mediaId];
              }
      }

      const result = await postToSocial(text, {
              platforms: ['x', 'linkedin', 'threads'],
              publishAt: null,  // null = 즉시 발행 (1분 후)
              draftTitle: `코인이지 데일리 브리핑 ${new Date().toISOString().slice(0, 10)}`,
              mediaIds,
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