import sharp from "sharp";

const ANGLES = [0, 90, 180, 270] as const;

/** Score the horizontal stroke density of a band — a TD3 MRZ line lights this up. */
export async function mrzBandScore(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { failOn: "none" })
    .rotate()
    .greyscale()
    .normalise()
    .resize({ width: 400 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const rows = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let prev = data[y * width] < 140;
    let transitions = 0;
    for (let x = 1; x < width; x++) {
      const ink = data[y * width + x] < 140;
      if (ink !== prev) transitions += 1;
      prev = ink;
    }
    rows[y] = transitions;
  }
  const window = Math.max(4, Math.round(height * 0.04));
  let best = 0;
  let bestY = 0;
  for (let y = 0; y <= height - window; y++) {
    let score = 0;
    for (let i = 0; i < window; i++) score += rows[y + i];
    if (score > best) {
      best = score;
      bestY = y + window / 2;
    }
  }
  return { score: best, frac: height ? bestY / height : 0 };
}

/** Tourne le scan pour que la bande MRZ soit en bas. */
export async function uprightPassport(bytes: Uint8Array): Promise<Buffer> {
  const original = await sharp(Buffer.from(bytes), { failOn: "none" }).rotate().jpeg({ quality: 90 }).toBuffer();
  let bestAngle: (typeof ANGLES)[number] = 0;
  let bestRank = -1;
  for (const angle of ANGLES) {
    const turned = angle === 0 ? original : await sharp(original).rotate(angle).toBuffer();
    const { score, frac } = await mrzBandScore(turned);
    const rank = (frac >= 0.55 ? 1_000_000 : 0) + score;
    if (rank > bestRank) {
      bestRank = rank;
      bestAngle = angle;
    }
  }
  if (bestAngle === 0) return original;
  return sharp(original).rotate(bestAngle).jpeg({ quality: 90 }).toBuffer();
}
