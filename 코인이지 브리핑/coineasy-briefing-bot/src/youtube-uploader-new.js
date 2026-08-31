// src/youtube-uploader.js
// =======================
// Uploads a local MP4 file to YouTube as a Short using the
// YouTube Data API v3 with OAuth2 credentials stored in env vars.
//
// Required environment variables:
//   YT_CLIENT_ID      - OAuth2 client ID
//   YT_CLIENT_SECRET   - OAuth2 client secret
//   YT_REFRESH_TOKEN   - long-lived refresh token
//   YT_REDIRECT_URI    - OAuth2 redirect URI (e.g. http://localhost)
//
// Required:
//   YT_PRIVACY_STATUS  - explicit 'public' | 'unlisted' | 'private' (no default)
//   COINEASY_YT_CHANNEL_ID - exact owner channel ID (UC..., not a handle)

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import * as CFG from './youtube-shorts-config.js';

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const READBACK_MAX_ATTEMPTS = 24;
const READBACK_INTERVAL_MS = 5000;
const READ_TIMEOUT_MS = 15000;
const verifiedPreflights = new WeakSet();
const consumedPreflights = new WeakSet();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Log/receipt errors never include a transport response, token, or request config.
function safeFailureKind(error) {
    const code = String(error?.code || error?.message || '');
    if (/^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ABORT_ERR)$/.test(code)) return code;
    const status = Number(error?.response?.status || error?.status || error?.code);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return `HTTP_${status}`;
    return 'transport_error';
}

class YouTubeUploadUncertainError extends Error {
    constructor(reason, videoId = null) {
        const validId = VIDEO_ID_RE.test(String(videoId || '')) ? String(videoId) : null;
        super(`YouTube 결과 검증 실패 (${reason}). 자동 재업로드 금지.`);
        this.name = 'YouTubeUploadUncertainError';
        this.code = 'YOUTUBE_EXTERNAL_STATE_UNCERTAIN';
        this.externalStateUncertain = true;
        this.automaticRetryAllowed = false;
        this.verificationReason = reason;
        this.videoId = validId;
        this.videoUrl = validId ? `https://www.youtube.com/shorts/${validId}` : null;
    }
}

// --- OAuth2 client ---
function buildOAuth2Client(env = process.env) {
    const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI, YT_REFRESH_TOKEN } = env;
    if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
          throw new Error(
                  'Missing YouTube credentials. Set YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.'
                );
    }
    const oauth2 = new google.auth.OAuth2(
          YT_CLIENT_ID,
          YT_CLIENT_SECRET,
          YT_REDIRECT_URI || 'http://localhost'
        );
    oauth2.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
    return oauth2;
}

function assertYouTubeCredentials(env = process.env) {
    const missing = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']
        .filter((name) => !String(env[name] || '').trim());
    if (missing.length) throw new Error(`Missing YouTube credentials: ${missing.join(', ')}`);
    const privacy = String(env.YT_PRIVACY_STATUS || '').trim().toLowerCase();
    if (!['public', 'unlisted', 'private'].includes(privacy)) {
        throw new Error('YT_PRIVACY_STATUS를 public, unlisted, private 중 하나로 명시해야 합니다.');
    }
    if (!CHANNEL_ID_RE.test(String(env.COINEASY_YT_CHANNEL_ID || '').trim())) {
        throw new Error('COINEASY_YT_CHANNEL_ID에 정확한 YouTube 채널 ID를 명시해야 합니다.');
    }
    return true;
}

// Read-only preflight. Call this before taking the daily claim or rendering.
// mine=true identifies the OAuth channel; no guessed handle or title matching.
// https://developers.google.com/youtube/v3/docs/channels/list
async function preflightYouTubeUpload(options = {}) {
    const env = options.env || process.env;
    assertYouTubeCredentials(env);
    const channelId = String(env.COINEASY_YT_CHANNEL_ID).trim();
    const privacyStatus = String(env.YT_PRIVACY_STATUS).trim().toLowerCase();
    const youtube = options.youtube || google.youtube({ version: 'v3', auth: buildOAuth2Client(env) });
    let response;
    try {
        response = await youtube.channels.list({
            part: ['id'],
            mine: true,
            maxResults: 2,
        }, { retry: false, retryConfig: { retry: 0 }, timeout: READ_TIMEOUT_MS });
    } catch (error) {
        throw new Error(`YouTube 채널 사전 확인 실패 (${safeFailureKind(error)}). 업로드하지 않았습니다.`);
    }
    const items = response?.data?.items;
    // Ambiguous OAuth ownership is not permission to select an arbitrary channel.
    if (!Array.isArray(items) || items.length !== 1 || response.data.nextPageToken
        || items[0]?.id !== channelId) {
        throw new Error('YouTube OAuth 채널이 COINEASY_YT_CHANNEL_ID와 정확히 일치하지 않습니다. 업로드하지 않았습니다.');
    }
    const preflight = Object.freeze({
        youtube,
        channelId,
        privacyStatus,
        verifiedAt: new Date().toISOString(),
    });
    verifiedPreflights.add(preflight);
    return preflight;
}

// --- Metadata builders (all Korean) ---
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function metadataText(value, name) {
    if (typeof value !== 'string' || !value.trim() || /^(undefined|null|nan|n\/?a|미확보)$/i.test(value.trim())) {
        throw new Error(`YouTube 메타데이터 ${name}가 누락되었습니다. 업로드하지 않았습니다.`);
    }
    return value.trim();
}

function metadataUrl(value, name) {
    const text = metadataText(value, name);
    let url;
    try { url = new URL(text); } catch { /* rejected below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
        throw new Error(`YouTube 메타데이터 ${name}는 인증정보 없는 HTTPS URL이어야 합니다.`);
    }
    return text;
}

function buildVideoMetadata(payload, now = new Date()) {
    const editorial = payload?.editorial || {};
    const article = payload?.article || {};
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error('YouTube 메타데이터 기준 시각이 유효하지 않습니다.');
    }
    const topic = metadataText(editorial.headline, 'editorial.headline');
    const fact = metadataText(editorial.fact, 'editorial.fact');
    const verdict = metadataText(editorial.verdict, 'editorial.verdict');
    const action = metadataText(editorial.action, 'editorial.action');
    const canonicalNaverUrl = metadataUrl(article.canonicalNaverUrl, 'article.canonicalNaverUrl');
    if (!Array.isArray(editorial.sourceUrls) || editorial.sourceUrls.length < 1) {
        throw new Error('YouTube 메타데이터 공식 출처가 누락되었습니다.');
    }
    const sourceUrls = editorial.sourceUrls.map((url, index) => metadataUrl(url, `sourceUrls[${index}]`));
    const metrics = payload?.youtube?.metrics;
    const metricLabels = ['BTC', '김치프리미엄', '공포탐욕'];
    if (!Array.isArray(metrics) || metrics.length !== metricLabels.length
        || new Set(metrics.map((metric) => metric?.label)).size !== metricLabels.length) {
        throw new Error('YouTube 메타데이터 BTC·김치프리미엄·공포탐욕 지표가 필요합니다.');
    }
    const metricLines = metricLabels.flatMap((label) => {
        const metric = metrics.find((entry) => entry?.label === label);
        const value = metadataText(metric?.value, `metrics.${label}.value`);
        const asOf = metadataText(metric?.as_of, `metrics.${label}.as_of`);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(asOf)
            || !Number.isFinite(Date.parse(asOf))) {
            throw new Error(`YouTube 메타데이터 ${label} 관측 시각이 유효하지 않습니다.`);
        }
        const sourceUrl = metadataUrl(metric?.source_url, `metrics.${label}.source_url`);
        if (!sourceUrls.includes(sourceUrl)) {
            throw new Error(`YouTube 메타데이터 ${label} 지표 출처가 승인된 출처 목록에 없습니다.`);
        }
        return [`${label}: ${value}`, `관측: ${asOf}`, `지표 출처: ${sourceUrl}`, ''];
    });

    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const weekday = WEEKDAY_KO[kst.getUTCDay()];
    const kstHour = kst.getUTCHours();
    const sessionLabel = kstHour < 12 ? '오전' : '저녁';
    const title = `${topic} | ${month}월 ${day}일 코인이지 #Shorts`;
    if (title.length > 100) throw new Error('YouTube 제목이 100자를 초과합니다. 승인 원고를 줄여야 합니다.');
    const hashtags = '#이지브리핑 #코인이지 #비트코인 #BTC #암호화폐 #크립토 #코인시황 #데일리브리핑 #유튜브쇼츠';
    const description = [
        `🍊 ${month}월 ${day}일 ${weekday}요일 ${sessionLabel} 코인이지 데일리 인사이트`,
        '',
        editorial.factTitle ? `핵심: ${metadataText(editorial.factTitle, 'editorial.factTitle')}` : '',
        `확인: ${fact}`,
        `해석: ${verdict}`,
        `오늘 확인할 것: ${action}`,
        `Naver: ${canonicalNaverUrl}`,
        ...sourceUrls.map((url, index) => `출처 ${index + 1}: ${url}`),
        '',
        '시장 맥락 (각 관측 시각 기준)',
        ...metricLines,
        '─────────────────────────',
        '📱 CoinEasy Telegram: https://t.me/coineasy_official',
        '※ 교육용 정보이며 투자·법률·세무 자문이 아닙니다.',
        '',
        hashtags,
    ].join('\n');
    // Never truncate the approved sources, action or disclaimer to fit a limit.
    if (description.length > 5000) throw new Error('YouTube 설명이 5,000자를 초과합니다. 출처·면책을 보존해 원고를 수정해야 합니다.');

    return {
        snippet: {
                title,
                description,
                tags: CFG.YT_DEFAULT_TAGS,
                categoryId: CFG.YT_CATEGORY_ID,
                defaultLanguage: CFG.YT_LANGUAGE,
                defaultAudioLanguage: CFG.YT_LANGUAGE,
        },
        status: {
                privacyStatus: CFG.YT_PRIVACY,
                selfDeclaredMadeForKids: false,
        },
  };
}

// The request is deliberately attempted exactly once. A transport error can
// occur after YouTube has accepted the upload, so the caller persists an
// external_state_uncertain fence and requires operator reconciliation.
async function uploadOnce(youtube, videoPath, metadata) {
    const fileSize = fs.statSync(videoPath).size;
    if (fileSize <= 0) throw new Error('YouTube 업로드 파일이 비어 있습니다.');
    console.log(`  [uploader] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
    console.log('  [uploader] 업로드 시도 1/1...');
    const mediaBody = fs.createReadStream(videoPath);
    let response;
    try {
        response = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: metadata,
            media: {
                mimeType: 'video/mp4',
                body: mediaBody,
            },
        }, {
            // googleapis enables retries by default. Explicitly disable transport
            // retries as well as application retries for this non-idempotent call.
            retry: false,
            retryConfig: { retry: 0, noResponseRetries: 0 },
            timeout: 60000,
        });
    } catch (error) {
        throw new YouTubeUploadUncertainError(`insert_${safeFailureKind(error)}`);
    } finally {
        mediaBody.destroy();
    }
    const videoId = String(response?.data?.id || '').trim();
    if (!VIDEO_ID_RE.test(videoId)) throw new YouTubeUploadUncertainError('insert_missing_video_id');
    const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
    console.log(`  [uploader] 업로드 요청 접수, 처리·공개 상태 확인 중: ${videoUrl}`);
    // This low-level identity is NOT a verified publication receipt.
    return { videoId, videoUrl };
}

// Poll only the exact newly inserted ID. A missing item or transient processing
// state permits bounded GETs, never another insert or an update to a reservation.
// processingDetails is owner-only, and privacy can be forced to private for an
// unaudited API project even when insert requested public.
// https://developers.google.com/youtube/v3/docs/videos
async function verifyUploadedVideo(youtube, videoId, expected, options = {}) {
    if (!VIDEO_ID_RE.test(String(videoId || ''))) throw new YouTubeUploadUncertainError('readback_invalid_video_id');
    if (!CHANNEL_ID_RE.test(String(expected?.channelId || ''))
        || !['public', 'unlisted', 'private'].includes(expected?.privacyStatus)) {
        throw new YouTubeUploadUncertainError('readback_invalid_expected_identity', videoId);
    }
    const maxAttempts = options.maxAttempts ?? READBACK_MAX_ATTEMPTS;
    const intervalMs = options.intervalMs ?? READBACK_INTERVAL_MS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > READBACK_MAX_ATTEMPTS
        || !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > READBACK_INTERVAL_MS) {
        throw new YouTubeUploadUncertainError('readback_invalid_poll_bound', videoId);
    }
    const pause = options.wait || wait;
    let pendingReason = 'readback_missing_video';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;
        try {
            response = await youtube.videos.list({
                part: ['snippet', 'status', 'processingDetails'],
                id: [videoId],
            }, { retry: false, retryConfig: { retry: 0 }, timeout: READ_TIMEOUT_MS });
        } catch (error) {
            throw new YouTubeUploadUncertainError(`readback_${safeFailureKind(error)}`, videoId);
        }
        const items = response?.data?.items;
        if (items !== undefined && !Array.isArray(items)) {
            throw new YouTubeUploadUncertainError('readback_malformed_items', videoId);
        }
        if (Array.isArray(items) && items.length > 0) {
            if (items.length !== 1 || items[0]?.id !== videoId) {
                throw new YouTubeUploadUncertainError('readback_video_id_mismatch', videoId);
            }
            const video = items[0];
            if (video.snippet?.channelId !== expected.channelId) {
                throw new YouTubeUploadUncertainError('readback_channel_mismatch', videoId);
            }
            const uploadStatus = video.status?.uploadStatus;
            const processingStatus = video.processingDetails?.processingStatus;
            const privacyStatus = video.status?.privacyStatus;
            if (['deleted', 'failed', 'rejected'].includes(uploadStatus)
                || ['failed', 'terminated'].includes(processingStatus)) {
                throw new YouTubeUploadUncertainError('readback_processing_failed', videoId);
            }
            if (video.status?.publishAt) {
                throw new YouTubeUploadUncertainError('readback_unexpected_schedule', videoId);
            }
            if (uploadStatus === 'processed' && processingStatus === 'succeeded') {
                if (privacyStatus !== expected.privacyStatus) {
                    throw new YouTubeUploadUncertainError('readback_privacy_mismatch', videoId);
                }
                return {
                    videoId,
                    videoUrl: `https://www.youtube.com/shorts/${videoId}`,
                    verification: {
                        channelId: expected.channelId,
                        privacyStatus,
                        uploadStatus,
                        processingStatus,
                        readbackVerified: true,
                        // This confirms public visibility from the owner API,
                        // not anonymous playback or Shorts feed eligibility.
                        publicStateVerified: privacyStatus === 'public',
                        method: 'youtube.videos.list',
                        verifiedAt: new Date().toISOString(),
                        readbackAttempts: attempt,
                    },
                };
            }
            pendingReason = 'readback_processing_not_complete';
        }
        if (attempt < maxAttempts) await pause(intervalMs);
    }
    throw new YouTubeUploadUncertainError(pendingReason, videoId);
}

// --- Public API ---
async function uploadToYouTube(videoPath, payload, now = new Date(), options = {}) {
    if (payload?.privatePreview === true || payload?.publishable === false) {
        throw new Error('비공개 디자인 미리보기는 YouTube에 업로드할 수 없습니다.');
    }
    // Validate all reviewed copy before any network preflight or insert attempt.
    const meta = buildVideoMetadata(payload, now);
    const env = options.env || process.env;
    assertYouTubeCredentials(env);
    const preflight = options.preflight || await preflightYouTubeUpload(options);
    if (!verifiedPreflights.has(preflight) || consumedPreflights.has(preflight)
        || preflight.channelId !== String(env.COINEASY_YT_CHANNEL_ID).trim()
        || preflight.privacyStatus !== String(env.YT_PRIVACY_STATUS).trim().toLowerCase()) {
        throw new Error('유효한 동일 채널·공개범위 사전 확인이 필요합니다. 업로드하지 않았습니다.');
    }
    // Use the preflight snapshot, not a potentially different import-time env.
    meta.status.privacyStatus = preflight.privacyStatus;
    consumedPreflights.add(preflight);
    const uploaded = await uploadOnce(preflight.youtube, videoPath, meta);
    const verified = await verifyUploadedVideo(preflight.youtube, uploaded.videoId, preflight, options.readback);
    console.log(`  [uploader] 처리·공개범위 확인 완료 (${verified.verification.privacyStatus}): ${verified.videoUrl}`);
    return verified;
}

function cleanupVideo(videoPath) {
    if (!videoPath) return false;
    try {
        if (typeof videoPath !== 'string' || !path.isAbsolute(videoPath)
            || path.basename(videoPath) !== 'coineasy-editorial.mp4') {
            throw new Error('렌더러의 예상 영상 경로가 아닙니다.');
        }
        const workDir = path.dirname(videoPath);
        if (!/^editorial-[A-Za-z0-9]{6}$/.test(path.basename(workDir))) {
            throw new Error('렌더러 전용 임시 디렉터리가 아닙니다.');
        }
        const rootStat = fs.lstatSync(CFG.OUTPUT_DIR);
        const dirStat = fs.lstatSync(workDir);
        const videoStat = fs.lstatSync(videoPath);
        const markerPath = path.join(workDir, '.coineasy-editorial-temp.json');
        const markerStat = fs.lstatSync(markerPath);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
            || !dirStat.isDirectory() || dirStat.isSymbolicLink()
            || !videoStat.isFile() || videoStat.isSymbolicLink()
            || !markerStat.isFile() || markerStat.isSymbolicLink()) {
            throw new Error('임시 파일 또는 디렉터리가 심볼릭 링크이거나 올바른 유형이 아닙니다.');
        }
        const root = fs.realpathSync(CFG.OUTPUT_DIR);
        const realWorkDir = fs.realpathSync(workDir);
        if (path.dirname(realWorkDir) !== root || path.dirname(fs.realpathSync(videoPath)) !== realWorkDir) {
            throw new Error('렌더러 전용 출력 루트 밖의 경로입니다.');
        }
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (marker.schema_version !== 1 || marker.owner !== 'coineasy-editorial-renderer') {
            throw new Error('렌더러 소유 표식이 일치하지 않습니다.');
        }
        fs.rmSync(realWorkDir, { recursive: true, force: false });
        console.log(`  [uploader] 렌더러 임시 파일 삭제 완료: ${realWorkDir}`);
        return true;
    } catch (err) {
        console.warn(`  [uploader] 임시 파일 삭제 생략: ${err.message}`);
        return false;
    }
}

export {
    assertYouTubeCredentials,
    buildVideoMetadata,
    cleanupVideo,
    preflightYouTubeUpload,
    uploadOnce,
    uploadToYouTube,
    verifyUploadedVideo,
    YouTubeUploadUncertainError,
};
