// Copies the untouched signalsmith-stretch ESM build to public/vendor (run after `pnpm add signalsmith-stretch` to upgrade).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/signalsmith-stretch/SignalsmithStretch.mjs', 'public/vendor/SignalsmithStretch.mjs');
console.log('vendored signalsmith-stretch');
