import puppeteer from 'puppeteer-core';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const BASE = 'http://localhost:5173/';
export const W = 1280, H = 720;

// Runs inside every page: Arabic UI, visible cursor, and fictional stand-ins for any
// company / customer / location text so no real customer data ends up in the video.
const initScript = () => {
  try { localStorage.setItem('utu-lang', 'ar'); } catch {}
  const COMPANIES = ['شركة الشروق للطاقة', 'نور الرافدين للطاقة الشمسية', 'سنا دجلة للطاقة', 'واحة الشمس للطاقة', 'أفق الشمس للحلول', 'ضياء بابل للطاقة', 'مدار الشمس للطاقة', 'بريق الخليج للطاقة', 'ينابيع النور للطاقة'];
  const TITLES = { 'منظومة': 'منظومة شمسية متكاملة', 'مشروع': 'مشروع طاقة شمسية' };
  const take = (el, key, list) => {
    if (!el.dataset[key]) { window.__n = (window.__n || 0) + 1; el.dataset[key] = String(window.__n); }
    return list[(Number(el.dataset[key]) - 1) % list.length];
  };
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  const setLastTextNode = (el, v) => {
    const nodes = [...el.childNodes].filter(n => n.nodeType === 3);
    const n = nodes[nodes.length - 1];
    if (n) { if (n.textContent !== v) n.textContent = v; } else el.appendChild(document.createTextNode(v));
  };
  const sanitize = () => {
    // company cards
    document.querySelectorAll('article[data-spotlight]').forEach(a => {
      const h = a.querySelector('h3'); if (!h) return;
      const name = take(a, 'fk', COMPANIES);
      setText(h, name);
      const initial = h.parentElement?.previousElementSibling; if (initial && initial.tagName === 'SPAN') setText(initial, name.replace('شركة ', '')[0]);
      const loc = h.nextElementSibling; if (loc) setLastTextNode(loc, 'بغداد');
      a.querySelectorAll('button span span').forEach(s => { if (/^\s*—/.test(s.textContent)) setText(s, ' — ' + name); });
    });
    // project cards
    document.querySelectorAll('main article').forEach(a => {
      if (a.hasAttribute('data-spotlight') || !a.querySelector('img')) return;
      const h = a.querySelector('h3'); if (!h) return;
      const idx = take(a, 'fp', COMPANIES);
      const typeTxt = h.previousElementSibling?.textContent || '';
      setText(h, /سكن|منزل/.test(typeTxt) ? 'منظومة منزلية هجينة' : /تجار/.test(typeTxt) ? 'منظومة لمنشأة تجارية' : /زراع/.test(typeTxt) ? 'منظومة لمشروع زراعي' : 'مشروع طاقة شمسية');
      const loc = h.nextElementSibling; if (loc && loc.tagName === 'P') setLastTextNode(loc, 'بغداد');
      a.querySelectorAll('p').forEach(p => {
        if (p.textContent.trim() === 'نفّذتها' && p.nextElementSibling) setText(p.nextElementSibling, idx);
      });
      const bq = a.querySelector('blockquote'); if (bq && bq.nextElementSibling?.tagName === 'P') setText(bq.nextElementSibling, 'عميل موثّق');
      const img = a.querySelector('img'); if (img) img.alt = 'منظومة شمسية';
    });
    // review cards
    document.querySelectorAll('figure').forEach(f => {
      const cap = f.querySelector('figcaption'); if (!cap) return;
      const spans = cap.querySelectorAll(':scope > span');
      if (spans[0]) setText(spans[0], 'ع');
      const inner = spans[1]?.querySelector('span'); if (inner) setText(inner, 'عميل موثّق');
      const idx = take(f, 'fr', COMPANIES);
      f.querySelectorAll('dl > div').forEach(d => {
        const dt = d.querySelector('dt')?.textContent || '', dd = d.querySelector('dd'); if (!dd) return;
        if (/المشروع/.test(dt)) setText(dd, 'منظومة شمسية');
        else if (/الموقع/.test(dt)) setText(dd, 'بغداد');
        else if (/الشركة/.test(dt)) setText(dd, idx);
      });
    });
    // the same review snippet that is embedded in the project cards is covered above;
    // company names in dialogs / drawers
  };
  const mount = () => {
    const c = document.createElement('div'); c.id = '__cur';
    c.style.cssText = 'position:fixed;left:-60px;top:-60px;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgba(255,255,255,.82);border:0;box-shadow:0 0 0 6px rgba(255,255,255,.22),0 6px 22px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .12s';
    const st = document.createElement('style'); st.textContent = '*{-webkit-user-select:none!important;user-select:none!important}'; document.head.appendChild(st);
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.65)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'scale(1)'; }, true);
    setInterval(sanitize, 120);
    new MutationObserver(sanitize).observe(document.body, { childList: true, subtree: true });
    sanitize();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
};

export async function launch() {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(initScript);
  return { b, p };
}

// smooth human-like mouse path
export async function glide(p, x, y, steps = 28, ms = 14) {
  const cur = p.__m || { x: 640, y: 360 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await p.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e);
    await sleep(ms);
  }
  p.__m = { x, y };
}
export async function centerOf(h) { const r = await h.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
export async function smoothScrollTo(p, y, ms = 1200) {
  await p.evaluate((y, ms) => new Promise(res => {
    const s = window.scrollY, d = y - s, t0 = performance.now();
    const f = now => { const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; window.scrollTo(0, s + d * e); t < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  }), y, ms);
}
