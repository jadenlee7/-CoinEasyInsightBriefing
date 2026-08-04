# CoinEasy daily YouTube editorial

`@CoinEasy` has one Shorts writer: **CoinEasyInsightBriefing**.

- Schedule: KST 18:05, once per day.
- Source: `coineasydaily:daily_brief:briefing:YYYY-MM-DD` in shared Redis.
- Format: one claim, one verified fact, why it matters, three market context
  values, one action, and the original source.
- Brand: `#FFFBF6`, `#FF6B17`, approved pink-to-peach gradient, official
  wordmark, official EasyBoy analyst scene, Korean Gmarket Sans assets.
- Safety: if the verified daily brief is missing, no generic price Short is
  substituted. Redis stores a seven-day upload receipt and a two-hour lock.

## Required production settings

```text
COINEASY_YT_OWNER=insight-briefing
REDIS_URL=...                         # shared with coineasydaily
YT_CLIENT_ID=...
YT_CLIENT_SECRET=...
YT_REFRESH_TOKEN=...
YT_PRIVACY_STATUS=public
```

`RUN_BRIEFING_ON_START` must remain unset. A deploy or restart should never
publish another Telegram/Typefully briefing.

The same `COINEASY_YT_OWNER=insight-briefing` value is set on `coineasydaily`
and `coineasy-meme-engine`. Their old uploaders remain available as explicit
fallbacks, but are disabled by default. Meme approvals continue to Drive and
the TikTok uploader without posting another YouTube Short.

## Editorial Redis contract

```json
{
  "headline": "one concise Korean market read",
  "items": [
    {
      "title": "verified issue",
      "bullets": ["confirmed fact", "context or uncertainty"],
      "source_link": "https://primary-or-original-source.example"
    }
  ],
  "watch": ["one concrete thing to check"],
  "verdict": "interpretation with a bounded action"
}
```

Facts, interpretation, and uncertainty must remain visibly separate. No
return promise, urgency bait, or investment/legal/tax advice is allowed.
