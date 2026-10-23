import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
const p = await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:5199/', {waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1500));
const sec = await p.$('#calculator');
await sec.scrollIntoView();
await new Promise(r=>setTimeout(r,1500));
await sec.screenshot({path:'c-empty.png'});
const [btn] = await p.$$('xpath/.//button[contains(., "example") or contains(., "Example") or contains(., "demo")]');
console.log('btn', !!btn, btn && await btn.evaluate(e=>e.textContent));
await btn.click();
await new Promise(r=>setTimeout(r,2500));
await sec.screenshot({path:'c-full.png'});
// find assessment button
const [ab] = await p.$$('xpath/.//button[contains(., "assessment")]');
console.log('ab', ab && await ab.evaluate(e=>e.textContent));
if (ab) { await ab.click(); await new Promise(r=>setTimeout(r,3000)); await p.screenshot({path:'a-1.png', fullPage:true}); }
await b.close();
