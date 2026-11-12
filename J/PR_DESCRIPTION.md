#968 follow-up on PR #970 (host-publish this patch)

## What changed

- **`list-row-dates.mjs`**: `tsListDateRange` is injected before `Oe=` in the served bundle so list rows and the hotel 390px harness share the same runtime. Prose calendar dates use `Intl` month names instead of hardcoded month regex tokens (fixes secrets `DATE-LITERAL` CI).
- **`index-BKun7ofk.js`**: Rebaked served bundle from upstream + existing trek patches.
- **`test_shared_hotels_390_text_wrap.mjs`**: Asserts approved v3 layout (price on top row; stars left of dates on second row).

## Verification (local, base `4f0fa505`)

```text
node scripts/rebake_served_trek_bundle.mjs
node scripts/test_served_star_rating_bundle.mjs
CHROME_PATH=/usr/bin/chromium-browser node scripts/test_shared_hotels_390_text_wrap.mjs
node scripts/test_check_hardcoded_content.mjs
node scripts/check-no-comments.mjs && node scripts/test_offline_manifest.mjs && BASE=vk node scripts/check-code-ratchet.mjs
npm run test:keepsake-style2
```

All exit 0 on the uncommitted tree at job end.

## Not in this patch

Gate B structure captures (32 tabs) and budget price/description completeness on the NYC reference trip — host Gate B + DATA fill after CI on published head.

Closes #968 (when merged with acceptance/Gate B policy satisfied).
