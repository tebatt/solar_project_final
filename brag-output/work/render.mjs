import puppeteer from 'puppeteer-core';
import fs from 'fs';
const mode=process.argv[2];
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new'});
const p = await b.newPage();
await p.setViewport({width:1920,height:1080,deviceScaleFactor:1});
await p.goto('file://'+process.cwd()+'/comp.html',{waitUntil:'networkidle0'});
await p.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode()));});
if(mode==='stills'){
  const ts=process.argv.slice(3).map(Number);
  for(const t of ts){ await p.evaluate(t=>render(t),t); await p.screenshot({path:`still-${t}.png`}); }
} else {
  fs.mkdirSync('frames',{recursive:true});
  const N=21*30;
  for(let f=0;f<N;f++){ await p.evaluate(t=>render(t),f/30); await p.screenshot({path:`frames/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:95}); }
}
await b.close();
