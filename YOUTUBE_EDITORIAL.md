# CoinEasy daily YouTube editorial

`@CoinEasy` has one Shorts writer: **CoinEasyInsightBriefing**.

- Schedule: KST 18:05, once per day.
- Coexistence: existing KST 20:30 YouTube Studio reservations remain unchanged.
  The article uploader may start only from 18:05:00 through 18:14:59 KST.
- Source: the exact signed, approved and Naver-published article handoff at
  `coineasy:youtube:article-handoff:YYYY-MM-DD` in shared Redis.
- Format: one claim, one verified fact, why it matters, three market context
  values, one action, and the original source.
- Brand: `#FFFBF6`, `#FF6B17`, approved pink-to-peach gradient, official
  wordmark (Figma `28747:92`), the brown-hat detective EasyBoy (`30401:1957`),
  and bundled licensed Pretendard 1.3.9. Flat editorial typography follows the
  reviewed preview; legacy misnamed analyst/detective images are not used.
- Safety: no daily-brief, live-price, recent-pack, or old-video fallback exists.
  Redis stores a persistent no-TTL claim before work and a persistent no-TTL
  receipt after success. Once the external upload request begins, any error is
  fenced as `external_state_uncertain` and is never retried automatically.
- Audio: approved Korean `voiceover_ko` and six `voiceover_segments_ko` are
  mandatory. The first five segments join to exactly the approved narration;
  the sixth is empty. Scene lengths are 4/6/6/6/6/4 seconds. FFmpeg checks each
  spoken segment ends at least 0.25 seconds before its scene ends, leaving the
  final four-second CTA silent. The actual MP4 is decoded and checked for
  1080x1920, 32 seconds before the single upload attempt.
- Verification: `channels.list(mine=true)` must match the configured channel
  before claiming the day. An insert ID is not success: `videos.list` must
  confirm the exact channel/ID, processing success and requested privacy.
  Persistent receipts include the readback proof. This proves API public state,
  not anonymous playback or Shorts feed placement. Readback failure preserves
  the known ID/URL in the uncertain claim and never retries the upload.

## Required production settings

```text
COINEASY_YT_OWNER=insight-briefing
COINEASY_YT_QUEUE_POLICY=coexist-article-1805-legacy-2030
COINEASY_YT_CHANNEL_ID=UCp9zq5au6xV12P2cqt-i9aA
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

`COINEASY_YT_QUEUE_POLICY` must exactly approve the separated-slot policy.
The 18:05 article uploader exits before Redis reads, rendering, or upload when
the value is missing or when the current KST time is outside 18:05–18:14.
Existing 20:30 reservations are not read, changed, cancelled, or rescheduled.
During coexistence, one 18:05 article Short and one existing 20:30 reserved
Short can become public on the same date.

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
    "voiceover_segments_ko": ["headline narration", "fact narration", "why narration", "context narration", "action narration", ""],
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

The example above documents shape only and is not a publishable pack. All five
spoken segments must be Korean, with maximum lengths 32/50/50/50/50 characters.
Metric values are strict strings: positive USD BTC (`$63,500.12`), signed or
unsigned percentage for kimchi premium greater than -100%, integer 0–100 for
fear/greed. Placeholders, ambiguous labels and non-numeric readings are rejected.
Each `as_of` has ISO seconds and a timezone (optional 1–3 digit milliseconds),
is on the pack's KST date, and cannot be later than the signed issue time.
At handoff issuance and again at upload, BTC/kimchi readings must be at most six
hours old, and fear/greed at most 30 hours old. Values are reviewed snapshots,
not refreshed after approval. Missing/stale input means no video that day.

## Activation gates

Code preparation, the ACTIVE Codex authoring automation, and local preview
renders do not activate the Railway uploader. Both the EasyFarm producer and
this consumer must be deployed, share a private HMAC secret/Redis connection,
and receive an exact-date approved and Naver-published pack. There is no input
fallback, auto-approval or historical backfill. Existing packs without a
`channels.youtube` contract remain valid articles but do not create Shorts.
Keep these deployment/credential steps distinct from the separate article
approval. The known channel ID above was checked by the owner API on
2026-08-31; preflight verifies it again on every upload attempt.

Before production activation, run all tests, build the Docker image (which
runs the native renderer layout test), inspect one full nonpublishable local
render, and separately approve any unlisted API canary. Do not set
`RUN_BRIEFING_ON_START`, recreate the old uploader or alter the 20:30 queue.
Only an exact-SHA deployed runtime and verified per-video receipt establish
activation/publication. An absent handoff, failed pre-upload check, rejected
readback, or persistent existing claim is visible in logs and is not success.

Local no-upload renderer validation:

```sh
node --test src/youtube-editorial*.test.js src/youtube-uploader.test.js
node src/youtube-editorial-renderer-smoke.js /path/to/private-smoke-output
```

The smoke fixture contains clearly labeled synthetic readings and is not
signed or queued. It must never be uploaded. Its `render-manifest.json` is
render evidence, not a publication receipt.

Facts, interpretation, and uncertainty must remain visibly separate. No
return promise, urgency bait, or investment/legal/tax advice is allowed.
