# Article Shorts asset provenance

The article renderer uses these exact assets rather than the legacy character filenames:

| Asset | Source |
| --- | --- |
| `assets/brand/figma-main-orange-logo.svg` | CoinEasy 2026 Figma node `28747:92`; cached reviewed EasyFarm asset `research/assets/2026-08-14-token-approval-phishing-checklist/figma-main-orange-logo.svg` |
| `assets/brand/figma-detective-easyboy.png` | CoinEasy 2026 Figma node `30401:1957`; cached reviewed EasyFarm asset `research/assets/2026-08-14-token-approval-phishing-checklist/figma-detective-easyboy.png` |
| `assets/fonts/Pretendard-{Regular,Medium,Bold,ExtraBold}.otf` | Unmodified official Pretendard `v1.3.9`, `packages/pretendard/dist/public/static/` |

Pretendard source: https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/public/static

The complete upstream SIL Open Font License is included as `assets/fonts/Pretendard-LICENSE.txt`.
CoinEasy assets retain their existing project ownership; the font license does not apply to them.

Layout: `#FFFBF6` ground, permitted `#FFEDF2` → `#FFF2E9` gradient, `#FF6B17` emphasis,
transparent official wordmark, flat rules and a pixel scene. No generic dashboard cards.
The renderer fails closed when fonts, assets, text-fit, audio timing, final resolution,
or full MP4 decode checks fail. A private smoke render is not publication approval.

SHA-256 pins:

```text
69a1aace1a426cfe25398806a41a9e3f600b22f1001b126043255d99f5183394  figma-main-orange-logo.svg
bf562515395086465976c82cb0b2dede9825aedcd71363946d8f82b9cb473f23  figma-detective-easyboy.png
3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93  Pretendard-Regular.otf
d39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0  Pretendard-Medium.otf
2e91915fab54df71cc9598ebf608b2bdb54c6fe3c066ac61dff0bc44fca71cc7  Pretendard-Bold.otf
c35fe941b7568d52a96010561540e47f9d3948dfde66ba25bc1908233e0a40cd  Pretendard-ExtraBold.otf
```
