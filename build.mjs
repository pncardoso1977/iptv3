import fs from 'node:fs';
import path from 'node:path';

const assets = path.join(process.cwd(), 'assets');
for (const file of ['mpegts.js', 'hls.min.js']) {
  const source = path.join(assets, file);
  if (!fs.existsSync(source) || fs.statSync(source).size === 0) {
    throw new Error(`Biblioteca local em falta: assets/${file}`);
  }
}
console.log('Bibliotecas locais do leitor validadas.');
