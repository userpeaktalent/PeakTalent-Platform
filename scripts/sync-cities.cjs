/* eslint-disable */
// Copies the minified cities dataset from the `all-countries-and-cities-json`
// dev dependency into `public/data/` so the app fetches it as a static asset
// at runtime instead of embedding it in the JS bundle.
//
// Run automatically before `npm run dev` and `npm run build` via the
// `predev` / `prebuild` scripts in package.json.

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = require.resolve('all-countries-and-cities-json/countries.min.json');
const TARGET_DIR = path.resolve(__dirname, '..', 'public', 'data');
const TARGET = path.join(TARGET_DIR, 'cities-by-country.json');

fs.mkdirSync(TARGET_DIR, { recursive: true });

const sourceStat = fs.statSync(SOURCE);
let needsCopy = true;

if (fs.existsSync(TARGET)) {
  const targetStat = fs.statSync(TARGET);
  if (targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
    needsCopy = false;
  }
}

if (needsCopy) {
  fs.copyFileSync(SOURCE, TARGET);
  console.log(`[sync-cities] copied ${(sourceStat.size / 1024).toFixed(1)} KB → public/data/cities-by-country.json`);
} else {
  console.log('[sync-cities] up to date');
}
