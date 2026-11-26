// Baut das komplette Spiel in eine einzige, sofort spielbare HTML-Datei.
// Aufruf: node build.js   →   index.html (Repo-Root) und dist/index.html
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const order = ['data.js', 'view.js', 'audio.js', 'models.js', 'world.js', 'controls.js', 'player.js', 'save.js', 'game.js', 'ui.js', 'main.js'];
const js = order.map(f => `// ---- ${f} ----\n` + src(f)).join('\n');
const three = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');
let html = src('template.html');
html = html.replace('/*CSS*/', () => src('style.css'))
  .replace('/*THREE*/', () => three.replace(/<\/script/gi, '<\\/script'))
  .replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('Gebaut:', (html.length / 1024).toFixed(0) + ' KB');
