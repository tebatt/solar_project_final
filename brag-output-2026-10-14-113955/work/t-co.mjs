import { launch, sleep, BASE } from './lib.mjs';
const { b, p } = await launch();
await p.goto(BASE + '#companies', { waitUntil: 'networkidle0' }); await sleep(2000);
console.log(await p.evaluate(() => [...document.querySelectorAll('a,button')].filter(x => /الشركات/.test(x.textContent)).map(x => x.tagName + ':' + x.textContent.trim().slice(0, 40) + ':' + (x.getAttribute('href') || ''))));
await b.close();
