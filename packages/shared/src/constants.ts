import type { Level } from './schemas/level';

// Mirrors docs/product/access-model.md. Change only together with that document.

export const LEVEL_LABELS: Readonly<Record<Level, string>> = {
  basic: 'Basic',
  intermediate: 'Intermediate',
  advance: 'Advance',
};

/** Prices in paise (₹1 = 100 paise), the unit Razorpay charges in. */
export const LEVEL_PRICE_PAISE: Readonly<Record<Level, number>> = {
  basic: 500_000,
  intermediate: 1_000_000,
  advance: 1_500_000,
};

/** Content months a purchase grants when no lower level is active. */
export const CONTENT_MONTHS: Readonly<Record<Level, number>> = {
  basic: 3,
  intermediate: 6,
  advance: 9,
};

/** Intermediate bought while Basic is active adds only Intermediate, for this long. */
export const INTERMEDIATE_UPGRADE_MONTHS = 3;

/** Every purchase, upgrades included, starts a fresh tool window of this length. */
export const TOOL_WINDOW_MONTHS = 3;
