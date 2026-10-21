// Serve dist/ and screenshot a harness page: node e2e-web.js <visualKey> [pct] [bg]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const key = process.argv[2] || 'probe', pct = process.argv[3] || '0.42', bg = process.argv[4] || '', surplus = process.argv[5] || '0';
const root = path.join(__dirname, process.env.DIST || 'dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const srv = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) f = path.join(root, 'index.html'); res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res); });
srv.listen(0, async () => {
  const port = srv.address().port, errs = [];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 420, height: 420 } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`http://localhost:${port}/?harness=${key}&pct=${pct}&surplus=${surplus}${bg ? '&bg=' + bg : ''}`);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(async () => { errs.push('harness never became ready'); errs.push(await p.evaluate(() => document.body.innerText.slice(0, 300))); });
  if (errs.length) { console.log(JSON.stringify({ errors: errs })); await p.screenshot({ path: 'shot-fail.png' }); await b.close(); srv.close(); return; }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${process.env.SHOTS || '.'}/shot-${key}-idle.png` });
  const r1 = await p.evaluate(() => Promise.race([window.__play('add', 50), new Promise(r => setTimeout(() => r('timeout'), 8000))]));
  await p.waitForTimeout(300); await p.screenshot({ path: `${process.env.SHOTS || '.'}/shot-${key}-after-add.png` });
  const msP = p.evaluate(() => Promise.race([window.__play('ms', 20), new Promise(r => setTimeout(() => r('timeout'), 8000))]));
  await p.waitForTimeout(500); await p.screenshot({ path: `${process.env.SHOTS || '.'}/shot-${key}-ms.png` });
  const r2 = await msP;
  console.log(JSON.stringify({ add: r1, ms: r2, errors: errs }));
  await b.close(); srv.close();
});
