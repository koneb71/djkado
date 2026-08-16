// Renders public/favicon.svg → build/icon.png (1024²). electron-builder derives .icns/.ico from it.
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
mkdirSync('build', { recursive: true });
const svg = readFileSync('public/favicon.svg');
await sharp(svg, { density: 512 }).resize(1024, 1024).png().toFile('build/icon.png');
console.log('wrote build/icon.png');
