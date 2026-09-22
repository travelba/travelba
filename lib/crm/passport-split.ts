export const TWO_UP_RATIO = 1.2;

export type CropRect = { left: number; top: number; width: number; height: number };

export function isTwoUpLandscape(width: number, height: number) {
  return width > 0 && height > 0 && width / height >= TWO_UP_RATIO;
}

export function isTwoUpPortrait(width: number, height: number) {
  return width > 0 && height > 0 && height / width >= TWO_UP_RATIO;
}

export function halfRects(
  width: number,
  height: number,
  axis: "x" | "y",
  overlapRatio = 0.08
): CropRect[] {
  const span = axis === "x" ? width : height;
  const overlap = Math.round(span * overlapRatio);
  const mid = Math.round(span / 2);
  if (axis === "x") {
    const leftWidth = Math.min(width, mid + overlap);
    const rightX = Math.max(0, mid - overlap);
    return [
      { left: 0, top: 0, width: leftWidth, height },
      { left: rightX, top: 0, width: width - rightX, height },
    ];
  }
  const topHeight = Math.min(height, mid + overlap);
  const bottomY = Math.max(0, mid - overlap);
  return [
    { left: 0, top: 0, width, height: topHeight },
    { left: 0, top: bottomY, width, height: height - bottomY },
  ];
}

/** Bas gauche / bas droit : pages d’identité de deux livrets ouverts sur la même photo. */
export function bottomIdentityRects(width: number, height: number): CropRect[] {
  const midX = Math.round(width / 2);
  const midY = Math.round(height / 2);
  const overlapX = Math.round(width * 0.04);
  const overlapY = Math.round(height * 0.04);
  const top = Math.max(0, midY - overlapY);
  const leftRight = Math.max(0, midX - overlapX);
  return [
    { left: 0, top, width: Math.min(width, midX + overlapX), height: height - top },
    { left: leftRight, top, width: width - leftRight, height: height - top },
  ];
}

export function multiPassportCrops(width: number, height: number): CropRect[] {
  if (isTwoUpLandscape(width, height)) {
    return [...halfRects(width, height, "x"), ...bottomIdentityRects(width, height)];
  }
  if (isTwoUpPortrait(width, height)) {
    return halfRects(width, height, "y");
  }
  return [];
}
