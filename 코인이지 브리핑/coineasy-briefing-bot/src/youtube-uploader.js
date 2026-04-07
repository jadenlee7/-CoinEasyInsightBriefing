/**
 * 코인이지 YouTube Shorts 업로더
 * Google OAuth2 + YouTube Data API v3
 * 비공개(private) 업로드 후 수동 공개 전환
 */

import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

// ============================================================
// OAuth2 클라이언트 설정
// ============================================================
function getOAuth2Client() {
    const clientId = process.env.YT_CLIENT_ID;
    const clientSecret = process.env.YT_CLIENT_SECRET;
    const redirectUri = process.env.YT_REDIRECT_URI;
    const refreshToken = process.env.YT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
        console.error('[YouTube] 환경변수 누락: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN 필요');
        return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;
}

// ============================================================
// YouTube Shorts 업로드
// ============================================================
export async function uploadToYouTube(videoPath, metadata) {
    console.log('[YouTube] 업로드 준비 중...');

  const auth = getOAuth2Client();
    if (!auth) {
          return { success: false, error: 'OAuth2 인증 실패 (환경변수 확인)' };
    }

  // 파일 크기 확인
  try {
        const fileStats = await stat(videoPath);
        const sizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
        console.log(`[YouTube] 파일 크기: ${sizeMB}MB`);
  } catch (err) {
        return { success: false, error: `파일 없음: ${videoPath}` };
  }

  const youtube = google.youtube({ version: 'v3', auth });

  // 오늘 날짜 (KST)
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

  const title = metadata?.title || `코인이지 데일리 브리핑 ${kstDate} #Shorts`;
    const description = metadata?.description || 
          `${kstDate} 크립토 시황 요약\n\n` +
          `비트코인, 이더리움, 김치프리미엄, 공포탐욕지수 등\n` +
          `매일 아침 업데이트되는 코인이지 데일리 브리핑!\n\n` +
          `📱 텔레그램: https://t.me/coiniseasy\n` +
          `🐦 X(Twitter): https://x.com/CoinEasy\n\n` +
          `#비트코인 #크립토 #코인이지 #김치프리미엄 #Shorts`;

  const tags = metadata?.tags || [
        '비트코인', '크립토', '코인이지', '김치프리미엄',
        'BTC', 'ETH', '암호화폐', '시황', 'Shorts',
        '데일리브리핑', '코인시세', '공포탐욕지수',
      ];

  try {
        console.log('[YouTube] 업로드 시작...');

      const response = await youtube.videos.insert({
              part: ['snippet', 'status'],
              requestBody: {
                        snippet: {
                                    title: title.substring(0, 100), // YouTube 제목 100자 제한
                                    description: description.substring(0, 5000),
                                    tags: tags,
                                    categoryId: '22', // People & Blogs
                                    defaultLanguage: 'ko',
                                    defaultAudioLanguage: 'ko',
                        },
                        status: {
                                    privacyStatus: 'private', // 비공개 업로드 (감사 전까지)
                                    selfDeclaredMadeForKids: false,
                                    embeddable: true,
                        },
              },
              media: {
                        body: createReadStream(videoPath),
              },
      });

      const videoId = response.data.id;
        const videoUrl = `https://youtube.com/shorts/${videoId}`;

      console.log(`[YouTube] ✅ 업로드 완료!`);
        console.log(`[YouTube] 📹 Video ID: ${videoId}`);
        console.log(`[YouTube] 🔗 URL: ${videoUrl}`);
        console.log(`[YouTube] 🔒 상태: 비공개 (수동으로 공개 전환 필요)`);

      return {
              success: true,
              videoId,
              videoUrl,
              privacyStatus: 'private',
      };

  } catch (err) {
        console.error(`[YouTube 업로드 에러] ${err.message}`);

      // 상세 에러 정보
      if (err.response) {
              console.error(`[YouTube] Status: ${err.response.status}`);
              console.error(`[YouTube] Data: ${JSON.stringify(err.response.data)}`);
      }

      // 할당량 초과 에러 처리
      if (err.message?.includes('quotaExceeded')) {
              console.error('[YouTube] ⚠️ API 할당량 초과 - 내일 다시 시도');
      }

      return { success: false, error: err.message };
  }
}
