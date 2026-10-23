import { launch, sleep, BASE } from './lib.mjs';
const { b, p } = await launch();
await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(1500);
const info = await p.evaluate(() => {
  const c = document.querySelector('#calculator');
  const bt = [...c.querySelectorAll('button')].map(x => (x.getAttribute('aria-label') || x.textContent.trim()).slice(0, 40));
  return { top: c.getBoundingClientRect().top + scrollY, bt };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
