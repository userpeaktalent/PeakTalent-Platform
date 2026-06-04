/* eslint-disable */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MARKETING_DIR = path.resolve(__dirname, '..', 'public', 'marketing');

const SOURCES = [
  // Hero background (above the fold, LCP candidate). Capped at 2560 wide for retina desktops.
  { input: 'why-us-photo.png', maxWidth: 2560, quality: 72 },
  // Belief section image, lazy-loaded further down.
  { input: 'hero-candidate.png', maxWidth: 1800, quality: 70 },
];

(async () => {
  for (const { input, maxWidth, quality } of SOURCES) {
    const inputPath = path.join(MARKETING_DIR, input);
    if (!fs.existsSync(inputPath)) {
      console.warn(`Skipping ${input}: not found`);
      continue;
    }

    const meta = await sharp(inputPath).metadata();
    const targetWidth = Math.min(maxWidth, meta.width || maxWidth);
    const outputName = input.replace(/\.png$/i, '.webp');
    const outputPath = path.join(MARKETING_DIR, outputName);

    await sharp(inputPath)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toFile(outputPath);

    const inSize = fs.statSync(inputPath).size;
    const outSize = fs.statSync(outputPath).size;
    const outMeta = await sharp(outputPath).metadata();
    console.log(
      `${input} (${meta.width}x${meta.height}, ${(inSize / 1024).toFixed(0)} KB) -> ` +
        `${outputName} (${outMeta.width}x${outMeta.height}, ${(outSize / 1024).toFixed(0)} KB, ` +
        `-${(100 - (outSize / inSize) * 100).toFixed(0)}%)`
    );
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
