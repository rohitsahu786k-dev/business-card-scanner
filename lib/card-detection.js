'use client';

const ANALYSIS_WIDTH = 96;
const ANALYSIS_HEIGHT = 60;

// The live scanner asks users to keep a landscape card inside the guide. This
// crop matches that guide and excludes most of the moving background.
export function getCardCrop(videoWidth, videoHeight) {
  const targetRatio = 1.586; // ISO/IEC 7810 ID-1 card ratio
  const maxWidth = videoWidth * 0.9;
  const maxHeight = videoHeight * 0.72;
  let width = maxWidth;
  let height = width / targetRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * targetRatio;
  }

  return {
    x: (videoWidth - width) / 2,
    y: (videoHeight - height) / 2,
    width,
    height,
  };
}

export function analyseVideoFrame(video, canvas) {
  if (!video?.videoWidth || !video?.videoHeight || !canvas) return null;

  const crop = getCardCrop(video.videoWidth, video.videoHeight);
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = ANALYSIS_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    ANALYSIS_WIDTH,
    ANALYSIS_HEIGHT,
  );

  const { data } = context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const grey = new Float32Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
  let sum = 0;
  let clipped = 0;

  for (let pixel = 0, index = 0; pixel < data.length; pixel += 4, index += 1) {
    const value = data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114;
    grey[index] = value;
    sum += value;
    if (value < 12 || value > 244) clipped += 1;
  }

  const mean = sum / grey.length;
  let variance = 0;
  let edgeCount = 0;
  let edgeStrength = 0;

  for (let y = 1; y < ANALYSIS_HEIGHT - 1; y += 1) {
    for (let x = 1; x < ANALYSIS_WIDTH - 1; x += 1) {
      const index = y * ANALYSIS_WIDTH + x;
      const delta = grey[index] - mean;
      variance += delta * delta;

      const horizontal = Math.abs(grey[index + 1] - grey[index - 1]);
      const vertical = Math.abs(grey[index + ANALYSIS_WIDTH] - grey[index - ANALYSIS_WIDTH]);
      const strength = horizontal + vertical;
      edgeStrength += strength;
      if (strength > 54) edgeCount += 1;
    }
  }

  const sampleCount = (ANALYSIS_WIDTH - 2) * (ANALYSIS_HEIGHT - 2);
  const contrast = Math.sqrt(variance / sampleCount);
  const sharpness = edgeStrength / sampleCount;
  const edgeDensity = edgeCount / sampleCount;
  const clippedRatio = clipped / grey.length;

  // A card with readable print has usable exposure, contrast and many small
  // edges. Conservative thresholds reduce accidental captures of blank desks.
  const cardLike =
    mean > 30 &&
    mean < 232 &&
    contrast > 24 &&
    sharpness > 14 &&
    edgeDensity > 0.04 &&
    edgeDensity < 0.62 &&
    clippedRatio < 0.42;

  const fingerprint = [];
  const columns = 8;
  const rows = 5;
  const cellWidth = ANALYSIS_WIDTH / columns;
  const cellHeight = ANALYSIS_HEIGHT / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let cellSum = 0;
      let count = 0;
      const startX = Math.floor(column * cellWidth);
      const endX = Math.floor((column + 1) * cellWidth);
      const startY = Math.floor(row * cellHeight);
      const endY = Math.floor((row + 1) * cellHeight);
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          cellSum += grey[y * ANALYSIS_WIDTH + x];
          count += 1;
        }
      }
      fingerprint.push(Math.round(cellSum / count));
    }
  }

  return { cardLike, fingerprint, mean, contrast, sharpness, edgeDensity };
}

export function fingerprintDistance(first, second) {
  if (!first || !second || first.length !== second.length) return Number.POSITIVE_INFINITY;
  return first.reduce((total, value, index) => total + Math.abs(value - second[index]), 0) / first.length;
}
