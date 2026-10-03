import { intakeShareSlug } from './intake-shared-trip.mjs';
import { tripSiteUrlFailure } from './trip-site-url-failure.mjs';
import { sharedTripWebsiteUrl } from './web-access.mjs';

function tripSlugFromMetadata(meta = {}) {
  return String(
    meta.publicSlug
    || meta.shareToken
    || meta.sharedToken
    || meta.source_token
    || '',
  ).trim();
}

export async function assignTripSiteUrl(db, tripId, env = process.env) {
  const publicSlug = intakeShareSlug(tripId);
  if (!publicSlug) throw tripSiteUrlFailure('onboarding trip site url missing slug', tripId);
  const publicUrl = sharedTripWebsiteUrl(publicSlug, env);
  const existing = await db`
    select metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const priorMeta = existing[0]?.metadata && typeof existing[0].metadata === 'object' ? existing[0].metadata : {};
  const priorSlug = tripSlugFromMetadata(priorMeta);
  if (priorSlug === publicSlug) {
    return {
      publicSlug,
      publicUrl: String(priorMeta.publicUrl || priorMeta.public_url || publicUrl).trim() || publicUrl,
    };
  }
  if (priorSlug && priorSlug !== publicSlug) {
    throw tripSiteUrlFailure('onboarding trip site url not stored', tripId);
  }
  const metadataPatch = JSON.stringify({ publicSlug, intakeShare: true, publicUrl });
  const updated = await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${metadataPatch}::jsonb,
        updated_at = now()
    where id = ${tripId}
      and coalesce(metadata->>'publicSlug', '') in ('', ${publicSlug})
      and coalesce(metadata->>'shareToken', '') in ('', ${publicSlug})
      and coalesce(metadata->>'sharedToken', '') in ('', ${publicSlug})
      and coalesce(metadata->>'source_token', '') in ('', ${publicSlug})
    returning metadata->>'publicSlug' as public_slug
  `;
  const stored = String(updated[0]?.public_slug || '').trim();
  if (stored === publicSlug) return { publicSlug, publicUrl };
  const reread = await db`
    select metadata->>'publicSlug' as public_slug, metadata->>'publicUrl' as public_url
    from trips
    where id = ${tripId}
    limit 1
  `;
  const afterSlug = String(reread[0]?.public_slug || '').trim();
  if (afterSlug === publicSlug) {
    const savedUrl = String(reread[0]?.public_url || '').trim();
    return { publicSlug, publicUrl: savedUrl || publicUrl };
  }
  throw tripSiteUrlFailure('onboarding trip site url not stored', tripId);
}
