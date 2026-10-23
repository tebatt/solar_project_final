import json
scenes=[ # id, clip, start, dur, title
('home','home',4.0,2.6,'طاقتك الشمسية تبدأ من هنا'),
('calc','calc',6.6,3.8,'احسب أحمالك بدقة'),
('assess','assess',10.4,2.8,'أوتو يقترح منظومتك المثالية'),
('assist','assist',13.2,4.8,'عندك سؤال؟ اسأل مساعد أوتو'),
('companies','companies',18.0,2.6,'شركات موثّقة تثق بها'),
('projects','projects',20.6,2.6,'منظومات حقيقية تعمل الآن'),
('reviews','reviews',23.2,2.2,'تجارب زبائن حقيقيين'),
('support','support',25.4,2.0,'دعمنا معك في كل خطوة'),
]
FX,FY,FW,FH=0,656,1080,608
bgv=''.join(f'    <video id="b-{i}" class="bgv" src="assets/clips/bg-{c}.mp4" muted playsinline data-start="{s}" data-duration="{d}" data-track-index="1"></video>\n' for i,c,s,d,t in scenes)
fv=''.join(f'    <video id="f-{i}" class="fv" src="assets/clips/{c}.mp4" muted playsinline data-start="{s}" data-duration="{d}" data-track-index="3"></video>\n' for i,c,s,d,t in scenes)
def words(t): return ''.join(f'<span class="w">{w}</span> ' for w in t.split())
titles=''.join(f'    <div id="t-{i}" class="title">{words(t)}</div>\n' for i,c,s,d,t in scenes)
html=f'''<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, height=1920">
<script src="assets/js/gsap.min.js"></script>
<style>
@font-face {{ font-family: "Plex Arabic"; src: url("assets/fonts/plex-ar-200.ttf"); font-weight: 200; }}
@font-face {{ font-family: "Plex Arabic"; src: url("assets/fonts/plex-ar-300.ttf"); font-weight: 300; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: 1080px; height: 1920px; background: #05070d; overflow: hidden; }}
#root {{ position: relative; width: 100%; height: 100%; overflow: hidden; background: #05070d; font-family: "Plex Arabic", sans-serif; font-weight: 200; direction: rtl; }}
.abs {{ position: absolute; }}
.bgv {{ position: absolute; left: -1166px; top: 0; width: 3413px; height: 1920px; object-fit: cover; filter: blur(34px) brightness(.8) saturate(1.2); }}
#tint {{ position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,14,34,.62) 0%, rgba(34,22,14,.28) 38%, rgba(34,22,14,.28) 62%, rgba(8,14,34,.70) 100%); opacity: 0; }}
.fv {{ position: absolute; left: {FX}px; top: {FY}px; width: {FW}px; height: {FH}px; object-fit: cover; background: #05070d; }}
#ring {{ position: absolute; left: {FX}px; top: {FY}px; width: {FW}px; height: {FH}px; border-top: 1px solid rgba(242,172,46,.35); border-bottom: 1px solid rgba(242,172,46,.35); box-shadow: 0 0 80px rgba(0,0,0,.55); opacity: 0; pointer-events: none; }}
#cbox {{ position: absolute; left: {FX}px; top: {FY}px; width: {FW}px; height: {FH}px; overflow: hidden; }}
.curtain {{ position: absolute; left: 0; top: -608px; width: 100%; height: 608px; background: linear-gradient(180deg, #0b1226, #1b130e); }}
#hero {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; object-fit: cover; opacity: 0; }}
.title {{ position: absolute; left: 90px; width: 900px; top: 400px; height: 220px; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 0 26px; text-align: center; color: #f4ead8; font-size: 76px; line-height: 1.3; font-weight: 200; letter-spacing: 0; }}
.title .w {{ display: inline-block; opacity: 0; }}
.title::after {{ content: ""; position: absolute; bottom: 6px; left: 50%; margin-left: -45px; width: 90px; height: 2px; background: #f2ac2e; opacity: 0; }}
.ctr {{ position: absolute; left: 0; width: 1080px; top: 1380px; display: flex; justify-content: center; gap: 70px; direction: ltr; opacity: 0; }}
.ctr .c {{ text-align: center; color: #f4ead8; min-width: 220px; }}
.ctr .n {{ font-size: 150px; line-height: 1.05; font-weight: 200; letter-spacing: -2px; font-variant-numeric: tabular-nums; }}
.ctr.small .n {{ font-size: 104px; }}
.ctr .u {{ font-size: 40px; color: #f2ac2e; font-weight: 300; margin-left: 6px; }}
.ctr .l {{ margin-top: 6px; font-size: 32px; font-weight: 300; color: rgba(244,234,216,.78); direction: rtl; }}
#dip {{ position: absolute; inset: 0; background: #070b18; opacity: 0; pointer-events: none; }}
#load {{ position: absolute; inset: 0; background: #000; }}
#load .lg {{ position: absolute; left: 0; width: 1080px; top: 840px; display: flex; justify-content: center; align-items: center; gap: 14px; direction: ltr; }}
#load .pct {{ position: absolute; left: 0; width: 1080px; top: 930px; text-align: center; color: #e9dfcb; font-size: 54px; font-weight: 200; direction: ltr; letter-spacing: 3px; }}
#load .bar {{ position: absolute; left: 420px; top: 1010px; width: 240px; height: 1px; background: rgba(233,223,203,.2); }}
#load .bar i {{ display: block; width: 100%; height: 1px; background: #f2ac2e; transform-origin: left center; transform: scaleX(0); }}
.mark {{ position: relative; width: 36px; height: 36px; border-radius: 11px; background: linear-gradient(145deg, #1d303b 0%, #0a0f13 100%); overflow: hidden; flex: none; }}
.mark .d {{ position: absolute; left: 10.5px; top: 5.5px; width: 15px; height: 15px; border-radius: 50%; background: linear-gradient(180deg, #f7c55f 0%, #e5754f 100%); }}
.mark .b1 {{ position: absolute; left: 6.5px; top: 23.5px; width: 23px; height: 3px; border-radius: 2px; background: #f2ac2e; }}
.mark .b2 {{ position: absolute; left: 10px; top: 28.5px; width: 16px; height: 3px; border-radius: 2px; background: rgba(242,172,46,.45); }}
.word {{ color: #f4ead8; font-size: 30px; font-weight: 300; letter-spacing: 1px; font-family: "Plex Arabic", sans-serif; }}
#closeBg {{ position: absolute; inset: 0; background: radial-gradient(900px 700px at 50% 38%, #f7f3ea 0%, #e6e1d6 60%, #d9d3c6 100%); opacity: 0; }}
#stage {{ position: absolute; left: 0; width: 1080px; top: 520px; height: 520px; perspective: 1400px; display: flex; justify-content: center; align-items: center; opacity: 0; }}
#logo3d {{ position: relative; width: 360px; height: 360px; transform-style: preserve-3d; }}
#logo3d .layer {{ position: absolute; left: 0; top: 0; width: 360px; height: 360px; border-radius: 110px; background: #0f1920; }}
#logo3d .face {{ position: absolute; left: 0; top: 0; width: 360px; height: 360px; border-radius: 110px; background: linear-gradient(145deg, #1d303b 0%, #0a0f13 100%); transform: translateZ(1px); overflow: hidden; }}
#logo3d .fd {{ position: absolute; left: 105px; top: 55px; width: 150px; height: 150px; border-radius: 50%; background: linear-gradient(180deg, #f7c55f 0%, #e5754f 100%); }}
#logo3d .fb1 {{ position: absolute; left: 65px; top: 235px; width: 230px; height: 30px; border-radius: 15px; background: #f2ac2e; }}
#logo3d .fb2 {{ position: absolute; left: 100px; top: 285px; width: 160px; height: 30px; border-radius: 15px; background: rgba(242,172,46,.45); }}
#ctitle {{ position: absolute; left: 90px; width: 900px; top: 1130px; height: 200px; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 0 28px; text-align: center; color: #121a2c; font-size: 96px; line-height: 1.3; font-weight: 300; }}
#ctitle .w {{ display: inline-block; opacity: 0; }}
#cline {{ position: absolute; left: 495px; top: 1350px; width: 90px; height: 2px; background: #c98a14; opacity: 0; }}
</style>
</head>
<body>
<div id="root" data-composition-id="utu-brag-cinematic" data-start="0" data-duration="30" data-width="1080" data-height="1920">
{bgv}    <div id="tint"></div>
{fv}    <div id="ring"></div>
    <div id="cbox">{"".join(f'<div id="curtain{k}" class="curtain" data-layout-allow-overflow></div>' for k in range(1,8))}</div>
    <img id="hero" src="assets/utu-3d-final.png" alt="">
{titles}    <div id="ctr-calc" class="ctr"><div class="c"><div class="n"><span class="v">0</span><span class="u">kWp</span></div><div class="l">قدرة الألواح المقترحة</div></div></div>
    <div id="ctr-assess" class="ctr small"><div class="c"><div class="n"><span class="v">0</span></div><div class="l">عدد الألواح</div></div><div class="c"><div class="n"><span class="v">0</span><span class="u">kWh</span></div><div class="l">سعة البطارية</div></div><div class="c"><div class="n"><span class="v">0</span><span class="u">%</span></div><div class="l">التغطية الشمسية</div></div></div>
    <div id="ctr-companies" class="ctr"><div class="c"><div class="n"><span class="v">0</span></div><div class="l">شركة موثّقة</div></div></div>
    <div id="ctr-reviews" class="ctr"><div class="c"><div class="n"><span class="v">0</span><span class="u">/ 5</span></div><div class="l">متوسط التقييمات الموثّقة</div></div></div>
    <div id="dip"></div>
    <div id="load"><div class="lg"><div class="mark"><i class="d"></i><i class="b1"></i><i class="b2"></i></div><span class="word">Utu</span></div><div class="pct" id="pct">0%</div><div class="bar"><i id="barfill"></i></div></div>
    <div id="closeBg"></div>
    <div id="stage"><div id="logo3d"></div></div>
    <div id="ctitle">{words('ابدأ مع أوتو اليوم')}</div>
    <div id="cline"></div>
    <audio id="score" src="assets/music/score.wav" data-start="0" data-duration="30" data-track-index="20" data-volume="0.9"></audio>
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
const S = {json.dumps([[i,s,d] for i,c,s,d,t in scenes])};
// build the 3D logo: dark extruded body + the real Utu mark (x10) on the front face
const lg = document.getElementById("logo3d");
for (let k = 15; k >= 1; k--) {{ const l = document.createElement("div"); l.className = "layer"; l.style.transform = "translateZ(" + (-k * 3) + "px)"; lg.appendChild(l); }}
const fr = document.createElement("div"); fr.className = "face";
fr.innerHTML = '<i class="fd"></i><i class="fb1"></i><i class="fb2"></i>'; lg.appendChild(fr);

// 1 — loading: 0 → 100%
const P = {{ v: 0 }};
tl.set("#pct", {{ opacity: 1 }}, 0);
tl.to(P, {{ v: 100, duration: 1.6, ease: "power1.inOut", onUpdate: () => {{ document.getElementById("pct").textContent = Math.round(P.v) + "%"; }} }}, 0.2);
tl.to("#barfill", {{ scaleX: 1, duration: 1.6, ease: "power1.inOut" }}, 0.2);
tl.fromTo("#load .lg", {{ opacity: 0, y: 14 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }}, 0.05);
tl.to("#load", {{ opacity: 0, duration: 0.25, ease: "power1.in" }}, 1.85);

// 2 — hero image: slow zoom-in, then it shrinks into the frame
tl.set("#hero", {{ opacity: 0, scale: 1, transformOrigin: "50% 50%", clipPath: "inset(0px 0px 0px 0px round 0px)" }}, 0);
tl.to("#hero", {{ opacity: 1, duration: 0.3, ease: "power1.out" }}, 1.85);
tl.to("#hero", {{ scale: 1.1, duration: 1.4, ease: "none" }}, 2.0);
tl.to("#hero", {{ clipPath: "inset({FY}px 0px {1920-FY-FH}px 0px round 16px)", duration: 0.65, ease: "power3.inOut" }}, 3.4);
tl.to("#hero", {{ opacity: 0, duration: 0.25, ease: "power1.in" }}, 3.9);
tl.to("#tint", {{ opacity: 1, duration: 0.6, ease: "power1.out" }}, 3.7);
tl.to("#ring", {{ opacity: 1, duration: 0.6, ease: "power1.out" }}, 3.7);

// scene titles: word by word, thin; counters slide up and count
S.forEach(([id, s, d]) => {{
  const ws = "#t-" + id + " .w";
  tl.fromTo(ws, {{ opacity: 0, y: 26, filter: "blur(10px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power3.out", stagger: 0.16 }}, s + 0.35);
  tl.fromTo("#t-" + id, {{ "--l": 0 }}, {{ "--l": 1, duration: 0.01 }}, s + 0.35);
  tl.to(ws, {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, s + d - 0.32);
}});
function counter(id, start, dur, targets) {{
  tl.fromTo("#" + id, {{ opacity: 0, y: 60 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }}, start);
  tl.to("#" + id, {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, start + dur - 0.3);
  targets.forEach(([idx, val, dec], k) => {{
    const el = document.querySelectorAll("#" + id + " .v")[idx]; const o = {{ x: 0 }};
    tl.to(o, {{ x: val, duration: dur - 0.9, ease: "power2.out", onUpdate: () => {{ el.textContent = o.x.toFixed(dec); }} }}, start + 0.15 + k * 0.12);
  }});
}}
counter("ctr-calc", 6.6 + 0.8, 3.8 - 0.8, [[0, 6.3, 1]]);
counter("ctr-assess", 10.4 + 0.7, 2.8 - 0.7, [[0, 9, 0], [1, 12.1, 1], [2, 100, 0]]);
counter("ctr-companies", 18.0 + 0.6, 2.6 - 0.6, [[0, 26, 0]]);
counter("ctr-reviews", 23.2 + 0.5, 2.2 - 0.5, [[0, 4.7, 1]]);

// transitions between sections: a dark panel drops through the frame, the next section sits behind it
for (let k = 1; k < S.length; k++) {{
  const c = S[k][1];
  tl.to("#curtain" + k, {{ y: {FH}, duration: 0.32, ease: "power2.in" }}, c - 0.32);
  tl.to("#curtain" + k, {{ y: {2*FH}, duration: 0.45, ease: "power2.out" }}, c);
  tl.to("#dip", {{ opacity: 0.5, duration: 0.3, ease: "power1.in" }}, c - 0.3);
  tl.to("#dip", {{ opacity: 0, duration: 0.45, ease: "power1.out" }}, c);
}}

// 11 — closing: light background, the Utu mark turns in 3D
const E = 27.4;
tl.to("#dip", {{ opacity: 0.7, duration: 0.4, ease: "power1.in" }}, E - 0.4);
tl.to("#closeBg", {{ opacity: 1, duration: 0.6, ease: "power1.inOut" }}, E - 0.1);
tl.to("#dip", {{ opacity: 0, duration: 0.5, ease: "power1.out" }}, E + 0.3);
tl.to(["#ring", "#tint"], {{ opacity: 0, duration: 0.4 }}, E);
tl.set("#logo3d", {{ rotationY: -40 }}, 0);
tl.fromTo("#stage", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }}, E + 0.1);
tl.to("#logo3d", {{ rotationY: 360, duration: 1.9, ease: "power2.inOut" }}, E + 0.1);
tl.fromTo("#ctitle .w", {{ opacity: 0, y: 26, filter: "blur(10px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power3.out", stagger: 0.18 }}, E + 0.7);
tl.to("#cline", {{ opacity: 1, duration: 0.5 }}, E + 1.5);
window.__timelines["utu-brag-cinematic"] = tl;
</script>
</body>
</html>
'''
open('index.html','w').write(html)
