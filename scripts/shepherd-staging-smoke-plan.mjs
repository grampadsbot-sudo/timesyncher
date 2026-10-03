/** Staging smoke execution plan (harness-only). */

export const SMOKE_PARALLEL_CONCURRENCY = 6;

/** Full registration order for cap / lint. */
export const SMOKE_CHECK_ORDER = [
  '1', '2', '3', '4', 'C', 'W', '5', 'I', '6', 'H', 'MAP', 'BUD', 'LOGO', 'INV-UI',
  '6b', 'T', 'CL', '7', '8', 'H2', 'M', 'R', 'K', 'O',
  'A1', 'A2', 'P', 'E', 'prior_db', 'D', 'INV-CLAIM',
];

/** Main customer spine — one session/trip/couponMain; must stay sequential. */
export const SMOKE_MAIN_SPINE_ORDER = [
  '1', '2', '3', '4', 'W', '5', 'I', '6', 'H',
  'MAP', 'BUD', 'LOGO', 'INV-UI', '6b', 'T', 'CL', '7', '8', 'M', 'R', 'O',
];

/**
 * Independent checks (each own customer + dedicated coupon or none).
 * Safe to run concurrently with each other and with main spine after bootstrap.
 */
export const SMOKE_PARALLEL_INDEPENDENT = [
  { name: 'C', coupon: 'couponMain', customer: 'checkout-ui', browser: true },
  { name: 'H2', coupon: 'couponH2', customer: 'h2-owner', browser: false },
  { name: 'K', coupon: null, customer: 'classifier-only', browser: false },
  { name: 'A1', coupon: 'couponA1', customer: 'a1-owner', browser: false },
  { name: 'A2', coupon: 'couponA2', customer: 'a2-owner', browser: false },
  { name: 'D', coupon: 'couponDTrip', customer: 'd-owner', browser: false },
  { name: 'INV-CLAIM', coupon: 'couponInvClaim', customer: 'inv-owner', browser: false },
];

export const SMOKE_PARALLEL_INDEPENDENT_NAMES = SMOKE_PARALLEL_INDEPENDENT.map((r) => r.name);

/** Post-spine checks that depend on main + parallel results. */
export const SMOKE_TAIL_SEQUENTIAL = ['E', 'prior_db', 'P'];

function assertParallelPlanDisjoint() {
  const coupons = SMOKE_PARALLEL_INDEPENDENT.map((r) => r.coupon).filter(Boolean);
  if (new Set(coupons).size !== coupons.length) {
    throw new Error('parallel plan reuses coupon slot');
  }
}

assertParallelPlanDisjoint();
