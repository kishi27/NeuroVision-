// Provisional visual comparison values, not official Android app parameters.
// All colors and base contrast/amplitude values retain the prior bright revision.
// orientationDegrees describes stripe direction; theta is its perpendicular carrier.
export const STANDARD_LINE_BASES = Object.freeze({
  1: Object.freeze({ lambda: 1.50, sigma: 0.22, darkPhase: Math.PI, excursionScale: 1 }),
  2: Object.freeze({ lambda: 0.68, sigma: 0.25, darkPhase: 0, excursionScale: 1 }),
  3: Object.freeze({ lambda: 0.46, sigma: 0.23, darkPhase: Math.PI, excursionScale: 2.6 }),
  4: Object.freeze({ lambda: 0.36, sigma: 0.23, darkPhase: 0, excursionScale: 5.8 })
});

const STANDARD_COMBINATIONS = Object.freeze([1, 2, 3, 4].flatMap(visualLineCount =>
  [0, 45, 90].map(orientationDegrees => Object.freeze({ visualLineCount, orientationDegrees }))));

function patch(pattern, id, visualLineCount, orientationDegrees) {
  const base = STANDARD_LINE_BASES[visualLineCount];
  return Object.freeze({ id: `pair-${id}`, visualLineCount, orientationDegrees,
    theta: (90 - orientationDegrees) * Math.PI / 180,
    lambda: base.lambda, sigma: base.sigma,
    psi: pattern.backgroundRGB[0] < 30 ? (base.darkPhase + Math.PI) % (2 * Math.PI) : base.darkPhase,
    gamma: 1.0, contrast: pattern.contrasts[id - 1],
    modulationAmplitude: pattern.modulationAmplitude * base.excursionScale, sizeInDegrees: 2 });
}

function pattern(backgroundRGB, modulationAmplitude, contrasts) {
  const theme = { backgroundRGB: Object.freeze(backgroundRGB), modulationAmplitude,
    contrasts: Object.freeze(contrasts), pixelsPerDegree: 192 };
  // Representative fixtures for inspection; gameplay generates fresh patches per round.
  const lines = [1, 2, 3, 4, 3, 4], angles = [0, 45, 90, 0, 45, 90];
  return Object.freeze({ ...theme, patches: Object.freeze(lines.map((line, i) =>
    patch(theme, i + 1, line, angles[i]))) });
}

export const TEMPORARY_STANDARD_PATTERNS = Object.freeze([
  pattern([248, 248, 245], 520, [0.80, 0.82, 0.80, 0.80, 0.80, 0.82]),
  pattern([173, 231, 231], 560, [0.70, 0.72, 0.70, 0.74, 0.74, 0.70]),
  pattern([245, 244, 237], 520, [0.80, 0.82, 0.84, 0.80, 0.82, 0.84]),
  pattern([244, 242, 202], 800, [0.52, 0.54, 0.52, 0.50, 0.52, 0.54]),
  pattern([202, 202, 206], 500, [0.80, 0.82, 0.80, 0.82, 0.80, 0.78]),
  pattern([18, 18, 20], 560, [0.84, 0.84, 0.84, 0.88, 0.88, 0.88])
]);

export function getStandardPatternIndex(round) {
  return (round - 1) % TEMPORARY_STANDARD_PATTERNS.length;
}

export function getStandardPattern(round) {
  return TEMPORARY_STANDARD_PATTERNS[getStandardPatternIndex(round)];
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectionSignature(patches) {
  return patches.map(p => `${p.visualLineCount}:${p.orientationDegrees}`).sort().join('|');
}

export function createStandardRoundPattern(round, random = Math.random, previousSelection) {
  const theme = getStandardPattern(round);
  const candidates = shuffled(STANDARD_COMBINATIONS, random);
  let selected = candidates.slice(0, 6);
  const counts = new Set(selected.map(p => p.visualLineCount));
  if (counts.size < 3) {
    // Six unique choices can cover only two counts when all three directions
    // of each count were selected. Replace one with an unused count.
    selected[5] = candidates.slice(6).find(p => !counts.has(p.visualLineCount));
  }
  // One direction has only four candidates, so six unique choices always
  // include at least two directions. Retain the adjacent-round repeat guard.
  if (selectionSignature(selected) === previousSelection) {
    selected = selected.map(p => ({ ...p, orientationDegrees: (p.orientationDegrees + 45) % 135 }));
  }
  const patches = selected.map((p, i) => patch(theme, i + 1, p.visualLineCount, p.orientationDegrees));
  return Object.freeze({ ...theme, patches: Object.freeze(patches) });
}
