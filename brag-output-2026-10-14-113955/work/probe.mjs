import puppeteer from 'puppeteer-core';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
const p = await b.newPage();
await p.setViewport({width:1080,height:1500,deviceScaleFactor:1});
await p.evaluateOnNewDocument(()=>localStorage.setItem('utu-lang','ar'));
for (const [n,h] of [['home','#/'],['companies','#/companies'],['projects','#/projects'],['reviews','#/reviews'],['faq','#/faq']]) {
  await p.goto('http://localhost:5173/'+h,{waitUntil:'networkidle0'}); await sleep(1800);
  await p.screenshot({path:`probe-${n}.png`});
  console.log(n, await p.evaluate(()=>document.documentElement.lang+' '+document.documentElement.dir+' h='+document.body.scrollHeight));
}
await b.close();
