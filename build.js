/* Build: concatenates the app into one HTML file.
   node build.js            -> dist/fives-artifact.html (claude.ai artifact, shared db)
   node build.js --server   -> server/public/index.html (REST API edition) */
const fs = require('fs'); const path = require('path');
const server = process.argv.includes('--server');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['shared.js', 'app-core.js', 'app-ui.js', 'page-dash.js', 'page-org.js', 'page-wo.js', 'page-car.js', 'page-admin.js', 'page-reports.js'].concat(server ? ['adapter-api.js'] : [], ['app-main.js']).map(src).join('\n;\n');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">';
const body = `<div id="app"></div>\n<script>${server ? "window.FIVES_MODE='api';" : ''}\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
let out;
if (server) out = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17212b"><link rel="manifest" href="/manifest.webmanifest"><title>5S Management System</title>${fonts}<style>${src('styles.css')}</style></head><body>${body}<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});</script></body></html>`;
else out = `<title>5S Management System</title>\n${fonts}\n<style>${src('styles.css')}</style>\n${body}\n`;
const dest = server ? path.join(__dirname, 'server', 'public', 'index.html') : path.join(__dirname, 'dist', 'fives-artifact.html');
fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + ' KB');
if (server) { // keep the server's copies of shared logic and the demo-data generator in sync
  const cp = (a, b, fix) => { let t = fs.readFileSync(path.join(__dirname, a), 'utf8'); if (fix) t = fix(t); fs.mkdirSync(path.dirname(path.join(__dirname, b)), { recursive: true }); fs.writeFileSync(path.join(__dirname, b), t); };
  cp('src/shared.js', 'server/src/shared.js');
  cp('seed/seed.js', 'server/db/seed/seed.js', (t) => t.replace("require('../src/shared.js')", "require('../../src/shared.js')"));
  cp('seed/to-docs.js', 'server/db/seed/to-docs.js');
  console.log('synced server/src/shared.js and server/db/seed');
}
