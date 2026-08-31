# CoinEasy daily YouTube editorial

`@CoinEasy` has one Shorts writer: **CoinEasyInsightBriefing**.

- Schedule: KST 18:05, once per day.
- Source: the exact signed, approved and Naver-published article handoff at
  `coineasy:youtube:article-handoff:YYYY-MM-DD` in shared Redis.
- Format: one claim, one verified fact, why it matters, three market context
  values, one action, and the original source.
- Brand: `#FFFBF6`, `#FF6B17`, approved pink-to-peach gradient, official
  wordmark, official EasyBoy analyst scene, Korean Gmarket Sans assets.
- Safety: no daily-brief, live-price, recent-pack, or old-video fallback exists.
  Redis stores a persistent no-TTL claim before work and a persistent no-TTL
  receipt after success. Once the external upload request begins, any error is
  fenced as `external_state_uncertain` and is never retried automatically.
- Audio: approved Korean `voiceover_ko` is mandatory and ffprobe must prove it
  is at most 30 seconds before the single YouTube upload attempt.

## Required production settings

```text
COINEASY_YT_OWNER=insight-briefing
COINEASY_YT_LEGACY_QUEUE_CLEARED=1   # only after separate queue reconciliation approval
COINEASY_YOUTUBE_HANDOFF_SECRET=...  # shared HMAC secret
COINEASY_YOUTUBE_HANDOFF_REDIS_URL=... # preferred; REDIS_URL is a compatibility fallback
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

`COINEASY_YT_LEGACY_QUEUE_CLEARED` intentionally remains unset until the
existing scheduled Shorts queue has been reconciled under separate approval.
Without it the 18:05 job exits before reading or uploading content.

## Signed article Redis contract

```json
{
  "schema_version": 1,
  "state": "approved_published",
  "date_kst": "2026-08-31",
  "publish_time_kst": "18:05",
  "repository": "jadenlee7/easyfarm",
  "source_sha": "40-character-git-sha",
  "pack_path": "research/packs/2026-08-31-example.json",
  "slug": "2026-08-31-example",
  "pack_sha256": "64-character-sha256",
  "approval_mode": "telegram",
  "canonical_naver_url": "https://blog.naver.com/coineasy/...",
  "issued_at": "2026-08-31T09:00:00.000Z",
  "youtube": {
    "enabled": true,
    "duration_seconds": 32,
    "scenes": [
      { "kind": "headline", "text": "..." },
      { "kind": "verified_fact", "text": "..." },
      { "kind": "why_it_matters", "text": "..." },
      { "kind": "market_context", "text": "..." },
      { "kind": "action", "text": "..." },
      { "kind": "source_cta", "text": "..." }
    ],
    "voiceover_ko": "the exact approved Korean narration",
    "source_urls": ["https://primary-source.example"],
    "metrics": [
      { "label": "BTC", "value": "...", "as_of": "...", "source_url": "https://..." },
      { "label": "김치프리미엄", "value": "...", "as_of": "...", "source_url": "https://..." },
      { "label": "공포탐욕", "value": "...", "as_of": "...", "source_url": "https://..." }
    ]
  },
  "signature": "hex-hmac-sha256"
}
```

The signature is HMAC-SHA256 over recursively key-sorted canonical JSON after
removing only the top-level `signature` field. The payload and claim/receipt
keys have no TTL. The writer uses `SET NX`; differing content for the same KST
date is an operator-visible conflict, never an overwrite.

Facts, interpretation, and uncertainty must remain visibly separate. No
return promise, urgency bait, or investment/legal/tax advice is allowed.
