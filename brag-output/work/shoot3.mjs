import puppeteer from 'puppeteer-core';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:5199/', {waitUntil:'networkidle0'});
await sleep(1500);
// hide floating assistant button
await p.addStyleTag({content:'button:has(> svg) {} '});
const hideAssist = async()=>p.evaluate(()=>{for(const el of document.querySelectorAll('button,a')) if(/Ask UTU Assistant/.test(el.textContent)) el.style.visibility='hidden';});
const sec = await p.$('#calculator'); await sec.scrollIntoView(); await sleep(800);
const [btn] = await p.$$('xpath/.//button[contains(., "Load demo values")]'); await btn.click(); await sleep(2000);
await hideAssist();
const lis = await p.$$('#calculator ul > li'); console.log('lis', lis.length);
let i=0; for (const li of lis.slice(3,8)) { await li.scrollIntoView(); await sleep(300); await li.screenshot({path:`row-${i++}.png`}); }
// result cards: find elements containing 'kWh / day' etc
const handles = await p.$$('xpath/.//*[contains(text(),"ESTIMATED RESULT") or contains(text(),"Estimated result")]');
console.log('res', handles.length);
const resBox = await handles[0].evaluateHandle(e=>{let n=e; while(n && !(n.querySelectorAll('button').length)) n=n.parentElement; return n;});
await resBox.asElement().scrollIntoView(); await sleep(500); await hideAssist();
await resBox.asElement().screenshot({path:'result.png'});
const grid = await resBox.evaluateHandle(e=>{ const all=[...e.querySelectorAll('*')]; return all.find(x=>x.children.length===5 && /kWp/.test(x.textContent)); });
const cards = await grid.evaluate(g=>[...g.children].map((c,k)=>k));
console.log('cards', cards.length);
for (let k=0;k<5;k++){ const c = await grid.evaluateHandle((g,k)=>g.children[k],k); await c.asElement().screenshot({path:`card-${k}.png`}); }
// assessment
const [ab] = await p.$$('xpath/.//button[contains(., "See UTU assessment")]'); await ab.click(); await sleep(2500); await hideAssist();
const tiers = await p.evaluateHandle(()=>{ const all=[...document.querySelectorAll('*')]; return all.filter(x=>/Economy/.test(x.textContent)&&/High independence/.test(x.textContent)&&/Balanced/.test(x.textContent)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; });
await tiers.asElement().scrollIntoView(); await sleep(500); await hideAssist();
await tiers.asElement().screenshot({path:'tiers.png'});
const mix = await p.evaluateHandle(()=>{ const all=[...document.querySelectorAll('*')]; return all.filter(x=>/Typical mix today/.test(x.textContent)&&/With the selected option/.test(x.textContent)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; });
await mix.asElement().scrollIntoView(); await sleep(500); await hideAssist();
for (let k=0;k<2;k++){ const c = await mix.evaluateHandle((g,k)=>g.children[k],k); await c.asElement().screenshot({path:`mix-${k}.png`}); }
await b.close();
