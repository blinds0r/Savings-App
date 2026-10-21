// Full-app walkthrough on web: onboarding -> home -> log -> edit -> settings. node e2e-app.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, process.env.DIST || 'dist-app');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const srv = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) f = path.join(root, 'index.html'); res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res); });
const out = process.env.SHOTS || 'shots-app'; fs.mkdirSync(out, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;
srv.listen(0, async () => {
  const port = srv.address().port, errs = [], log = (m) => console.log(m);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(`http://localhost:${port}/`);
  await p.waitForSelector(tid('onbAmt'), { timeout: 30000 }).catch(() => errs.push('onboarding did not appear'));
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/01-onb1.png` });
  await p.click(tid('onbNext')); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/02-onb2.png` });
  await p.click(tid('vcard-galaxy')); await p.waitForTimeout(200);
  await p.click(tid('onbDone')); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/03-home-empty.png` });
  // log a skip
  await p.click(tid('logBtn')); await p.waitForTimeout(500);
  const dis0 = await p.getAttribute(tid('lgo'), 'aria-disabled');
  await p.fill(tid('lw'), 'Uber Eats'); await p.fill(tid('la'), '50'); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/04-log.png` });
  const dis1 = await p.getAttribute(tid('lgo'), 'aria-disabled');
  log(`log button disabled before/after: ${dis0} / ${dis1}`);
  await p.click(tid('lgo')); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/05-after-add.png` });
  const amount = await p.textContent(tid('amount')); log('amount after add: ' + amount);
  // second add crossing 5% of 3000 => $150 -> milestone
  await p.click(tid('logBtn')); await p.waitForTimeout(500);
  await p.fill(tid('lw'), 'Jacket'); await p.fill(tid('la'), '120'); await p.click(tid('lgo')); await p.waitForTimeout(3200);
  await p.screenshot({ path: `${out}/06-milestone.png` });
  const cele = await p.textContent('body'); log('milestone card: ' + (/5% lit|Core lit/.test(cele) ? 'yes' : 'no'));
  // edit: two taps on the amount
  const amtBtn = p.locator('[data-testid^="amt-"]').first();
  await amtBtn.click(); await p.waitForTimeout(150); const armedTxt = await amtBtn.textContent(); await amtBtn.click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/07-edit.png` });
  await p.fill(tid('la'), '75'); await p.click(tid('lgo')); await p.waitForTimeout(600);
  const amount2 = await p.textContent(tid('amount')); log(`armed text: ${armedTxt}; amount after edit: ${amount2}`);
  // settings: switch skin to tree
  await p.click(tid('setBtn')); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/08-settings.png` });
  await p.locator('[aria-label="Settings"] >> text=Money tree').click(); await p.click(tid('sSave')); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/09-tree.png` });
  // reload: persisted?
  await p.reload(); await p.waitForTimeout(2500);
  const amount3 = await p.textContent(tid('amount')).catch(() => 'missing'); log('after reload: ' + amount3);
  await p.screenshot({ path: `${out}/10-reload.png` });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > 390) errs.push('horizontal overflow ' + sw);
  console.log('ERRORS', JSON.stringify(errs));
  await b.close(); srv.close();
});
