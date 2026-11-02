import { auditScheduledThingLogos } from '../../../src/vacation/shared-trip-logo-audit.mjs';
import { runVisibleSharedLogoCheck } from '../../lib/shared-trip-visible-logo-check.mjs';

function logoUrlRowsFromSharedTrip(shared = {}) {
  return auditScheduledThingLogos(shared).rows.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logoUrl,
  }));
}

export async function runGateBVisibleLogoCheck(page, sharedJson = {}) {
  const logoUrls = logoUrlRowsFromSharedTrip(sharedJson);
  const visible = await runVisibleSharedLogoCheck(page, { logoUrls });
  return {
    pass: visible.pass,
    checkLOGO758: visible.checkLOGO758,
    failReason: visible.failReason,
    logoUrlRows: logoUrls.length,
  };
}
