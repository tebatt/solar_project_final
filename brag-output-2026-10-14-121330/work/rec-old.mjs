import fs from 'fs';
import { launch, sleep, BASE, glide, centerOf, smoothScrollTo } from './lib.mjs';
const only = process.argv[2];
const marks = fs.existsSync('marks.json') ? JSON.parse(fs.readFileSync('marks.json')) : {};
const save = () => fs.writeFileSync('marks.json', JSON.stringify(marks, null, 1));
const clickByLabel = async (p, label, { scrollIntoView = true } = {}) => {
  const [h] = await p.$$(`xpath/.//button[contains(@aria-label, "${label}") or contains(., "${label}")] | .//a[contains(., "${label}")]`);
  if (!h) throw new Error('no button ' + label);
  if (scrollIntoView) await h.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'smooth' })), await sleep(700);
  const c = await centerOf(h); await glide(p, c.x, c.y, 22, 12); await sleep(120); await p.mouse.click(c.x, c.y); return h;
};
async function session(name, fn) {
  if (only && only !== name) return;
  const { b, p } = await launch();
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(600);
  const rec = await p.screencast({ path: `${name}.webm` });
  const t0 = Date.now(); const at = () => +((Date.now() - t0) / 1000).toFixed(2);
  marks[name] = {}; const mark = k => { marks[name][k] = at(); };
  await fn(p, mark);
  mark('end'); await rec.stop(); await b.close(); save(); console.log(name, JSON.stringify(marks[name]));
}

// 2 — home: sun glow, animated production bars, counters, hover on CTA
await session('home', async (p, mark) => {
  await p.reload({ waitUntil: 'networkidle0' }); mark('start');
  await sleep(1800);
  const [cta] = await p.$$('xpath/.//a[contains(., "احسب أحمالك")] | .//button[contains(., "احسب أحمالك")]');
  if (cta) { const c = await centerOf(cta); await glide(p, c.x, c.y, 30, 14); }
  await sleep(1600);
  await smoothScrollTo(p, 260, 1400); await sleep(500);
});

// 3 + 4 + 5 — calculator → assessment → assistant, one continuous live session
await session('flow', async (p, mark) => {
  await smoothScrollTo(p, 880, 1100); await sleep(500); mark('calc');
  await clickByLabel(p, 'تحميل القيم التجريبية', { scrollIntoView: false }); await sleep(900);
  for (const n of ['مكيّف سبليت', 'ثلاجة / مجمدة', 'إنارة LED', 'تلفزيون', 'مضخة ماء']) {
    const [h] = await p.$$(`xpath/.//button[@aria-label="زيادة عدد ${n}"]`);
    if (!h) continue;
    await h.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'smooth' })); await sleep(450);
    const c = await centerOf(h); await glide(p, c.x, c.y, 14, 10); await p.mouse.click(c.x, c.y); await sleep(380);
  }
  await sleep(400);
  const [res] = await p.$$('xpath/.//button[contains(., "شوف تقييم UTU")]');
  await res.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'smooth' })); await sleep(1700);
  mark('result');
  const c = await centerOf(res); await glide(p, c.x, c.y, 24, 12); await sleep(500);
  await p.mouse.click(c.x, c.y); await sleep(2600); mark('assess');
  await smoothScrollTo(p, 420, 1500); await sleep(1200);
  mark('assistant');
  await smoothScrollTo(p, 0, 700); await sleep(600);
  await clickByLabel(p, 'استشر مساعد UTU', { scrollIntoView: false }); await sleep(1000);
  const input = await p.$('#utu-assistant-question'); const ic = await centerOf(input);
  await glide(p, ic.x, ic.y, 18, 12); await p.mouse.click(ic.x, ic.y);
  await p.type('#utu-assistant-question', 'كم تستغرق عملية التركيب؟', { delay: 85 }); await sleep(500);
  // answers are instant in the app; reveal this one as typed text (text-node edit only, no layout change)
  await p.evaluate(() => {
    const ul = document.querySelector('[role=dialog] ul');
    new MutationObserver(() => {
      const li = ul.lastElementChild;
      if (!li || li.dataset.typed || !/rounded-ss-sm/.test(li.className)) return;
      li.dataset.typed = '1';
      const tn = li.firstChild, full = tn.nodeValue; tn.nodeValue = '';
      let i = 0; const id = setInterval(() => { i += 2; tn.nodeValue = full.slice(0, i); if (i >= full.length) clearInterval(id); }, 38);
    }).observe(ul, { childList: true });
  });
  await p.keyboard.press('Enter'); mark('typing');
  await sleep(7500);
});

// 6 — companies: page transition via nav, cursor hovering cards
await session('companies', async (p, mark) => {
  await clickByLabel(p, 'شركات الطاقة', { scrollIntoView: false }); await sleep(1800);
  await clickByLabel(p, 'عرض كل الشركات'); await sleep(1700); mark('start');
  await smoothScrollTo(p, 0, 300);
  const cards = await p.$$('article[data-spotlight]');
  for (const i of [0, 1, 2, 4, 5, 3]) {
    const c = await centerOf(cards[i]); await glide(p, c.x, c.y - 40, 20, 12); await sleep(520);
  }
});

// 7 — projects: real installed systems
await session('projects', async (p, mark) => {
  await clickByLabel(p, 'المشاريع', { scrollIntoView: false }); await sleep(1800);
  await clickByLabel(p, 'عرض كل المشاريع'); await sleep(1800); mark('start');
  await smoothScrollTo(p, 0, 300);
  const cards = await p.$$('main article');
  for (const i of [0, 1, 2]) { const c = await centerOf(cards[i]); await glide(p, c.x, c.y - 60, 20, 12); await sleep(450); }
  await smoothScrollTo(p, 520, 1300); await sleep(700);
});

// 8 — reviews
await session('reviews', async (p, mark) => {
  await p.evaluate(() => { location.hash = '#/reviews'; }); await sleep(1700); mark('start');
  await glide(p, 540, 700, 16, 12);
  await smoothScrollTo(p, 420, 1500); await sleep(500);
  await smoothScrollTo(p, 900, 1500); await sleep(500);
});

// 9 — support / FAQ
await session('support', async (p, mark) => {
  await clickByLabel(p, 'الأسئلة والدعم', { scrollIntoView: false }); await sleep(1500); mark('start');
  await glide(p, 760, 500, 20, 12); await sleep(500);
  const [q] = await p.$$('xpath/.//*[self::button or self::summary or @role="button"][contains(., "الضمانات المشمولة")] | .//*[contains(text(), "الضمانات المشمولة")]');
  const c = await centerOf(q); await glide(p, c.x, c.y, 22, 12); await sleep(250); await p.mouse.click(c.x, c.y); await sleep(1600);
});
