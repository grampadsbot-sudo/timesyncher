import { auditScheduledThingLogos } from '../../../../src/vacation/shared-trip-logo-audit.mjs';

export function liveAcceptScheduledLogoAudit(sharedTrip = {}) {
  const audit = auditScheduledThingLogos(sharedTrip);
  return {
    pass: audit.pass,
    count: audit.count,
    failing: audit.failing.map((row) => ({
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
      issues: row.issues,
    })),
  };
}
