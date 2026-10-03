// Provisional visual comparison values, not official Android app parameters.
// All colors and base contrast/amplitude values retain the prior bright revision.
// orientationDegrees describes stripe direction; theta is its perpendicular carrier.
export const STANDARD_LINE_BASES = Object.freeze({
  1: Object.freeze({ lambda: 1.50, sigma: 0.22, darkPhase: Math.PI, excursionScale: 1, gammas: Object.freeze([0.75, 0.95]) }),
  2: Object.freeze({ lambda: 0.68, sigma: 0.25, darkPhase: 0, excursionScale: 1, gammas: Object.freeze([0.82, 1.00]) }),
  3: Object.freeze({ lambda: 0.46, sigma: 0.23, darkPhase: Math.PI, excursionScale: 2.6, gammas: Object.freeze([0.90, 1.10]) }),
  4: Object.freeze({ lambda: 0.36, sigma: 0.23, darkPhase: 0, excursionScale: 5.8, gammas: Object.freeze([0.90, 1.10]) })
});

function patch(pattern, id, visualLineCount, orientationDegrees, variant = 0) {
  const base = STANDARD_LINE_BASES[visualLineCount];
  return Object.freeze({ id: `pair-${id}`, visualLineCount, orientationDegrees,
    theta: (90 - orientationDegrees) * Math.PI / 180,
    lambda: base.lambda, sigma: base.sigma,
    psi: pattern.backgroundRGB[0] < 30 ? (base.darkPhase + Math.PI) % (2 * Math.PI) : base.darkPhase,
    gamma: base.gammas[variant], contrast: pattern.contrasts[id - 1],
    modulationAmplitude: pattern.modulationAmplitude * base.excursionScale, sizeInDegrees: 2 });
}

function pattern(backgroundRGB, modulationAmplitude, contrasts) {
  const theme = { backgroundRGB: Object.freeze(backgroundRGB), modulationAmplitude,
    contrasts: Object.freeze(contrasts), pixelsPerDegree: 192 };
  // Representative fixtures for inspection; gameplay generates fresh patches per round.
  const lines = [1, 2, 3, 4, 3, 4], angles = [0, 45, 90, 0, 90, 0];
  return Object.freeze({ ...theme, patches: Object.freeze(lines.map((line, i) =>
    patch(theme, i + 1, line, angles[i], i >= 4 ? 1 : 0))) });
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
  const kinds = shuffled([1, 2, 3, 4], random).slice(0, random() < 0.5 ? 3 : 4);
  const counts = [...kinds];
  while (counts.length < 6) counts.push(kinds[Math.floor(random() * kinds.length)]);
  const lines = shuffled(counts, random);
  // Every direction is used twice, so direction alone cannot identify a pair.
  let angles = shuffled([0, 0, 45, 45, 90, 90], random);
  if (selectionSignature(lines.map((n,i) => ({ visualLineCount:n, orientationDegrees:angles[i] }))) === previousSelection) {
    // Bounded fallback, including deterministic RNGs; never retry indefinitely.
    angles = angles.map(angle => (angle + 45) % 135);
  }
  const used = new Map();
  const patches = lines.map((line, i) => {
    const key = `${line}:${angles[i]}`, variant = used.get(key) ?? 0;
    used.set(key, variant + 1);
    // At most two copies of a direction exist; duplicate combinations use two
    // distinct Gaussian aspect ratios and are separate pairs.
    return patch(theme, i + 1, line, angles[i], variant);
  });
  return Object.freeze({ ...theme, patches: Object.freeze(patches) });
}
