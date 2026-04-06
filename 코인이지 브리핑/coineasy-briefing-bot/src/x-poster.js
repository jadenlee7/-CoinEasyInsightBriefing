/**
 * 코인이지 데일리 브리핑 - X (Twitter) 포스팅 모듈
 * twitter-api-v2 라이브러리를 사용해서 X에 자동 포스팅
 */

import { TwitterApi } from 'twitter-api-v2';

// ============================================================
// X API 클라이언트 초기화
// ============================================================

function getXClient() {
    const appKey = process.env.X_API_KEY;
    const appSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
        throw new Error('X API 환경변수가 설정되지 않았습니다. X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET 필요');
  }

  return new TwitterApi({
        appKey,
        appSecret,
        accessToken,
        accessSecret,
  });
}

// ============================================================
// X에 트윗 포스팅
// ============================================================

export async function postToX(text) {
    try {
          const client = getXClient();
          const rwClient = client.readWrite;

      console.log(`[X 포스팅] 트윗 발송 중... (${text.length}자)`);

      const tweet = await rwClient.v2.tweet(text);

      console.log(`[X 포스팅] 성공! Tweet ID: ${tweet.data.id}`);
          return {
                  success: true,
                  tweetId: tweet.data.id,
                  text: tweet.data.text,
          };
    } catch (err) {
          console.error(`[X 포스팅 에러] ${err.message}`);

      // Rate limit 에러 처리
      if (err.code === 429 || err.rateLimit) {
              const resetTime = err.rateLimit?.reset
                ? new Date(err.rateLimit.reset * 1000).toISOString()
                        : 'unknown';
              console.error(`[X 포스팅] Rate limit 초과. 리셋 시간: ${resetTime}`);
      }

      // 중복 트윗 에러 처리
      if (err.code === 403 && err.message?.includes('duplicate')) {
              console.error('[X 포스팅] 중복 트윗 감지 - 동일한 내용이 이미 포스팅됨');
      }

      return {
              success: false,
              error: err.message,
              code: err.code,
      };
    }
}
