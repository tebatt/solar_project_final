import numpy as np, wave
from itertools import accumulate
SR=44100; T=30.0; N=int(SR*T); t=np.arange(N)/SR
rng=np.random.default_rng(11)
hz=lambda m:440*2**((m-69)/12)
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/SR); return np.fromiter(accumulate(x,lambda s,v:(1-a)*v+a*s),float,len(x))
# slow, dark, warm: Dm9 -> Bbmaj7 -> Gm9 -> A(sus) -> Dmaj (resolve for the light finale)
segs=[(0,7,[38,50,57,60,64]),(7,14,[34,46,53,57,62]),(14,21,[31,43,50,58,62]),(21,27.4,[33,45,52,57,64]),(27.4,31,[38,50,57,62,66,69])]
def env(a,b,fade=2.0):
    e=np.clip((t-a+fade/2)/fade,0,1)*np.clip((b+fade/2-t)/fade,0,1); return e*e*(3-2*e)
pad=np.zeros((2,N))
for a,b,notes in segs:
    e=env(a,b)
    for m in notes[1:]:
        f=hz(m)
        for ch,det in ((0,-0.15),(1,0.17)):
            ph=2*np.pi*f*(1+det/100)*t+rng.uniform(0,6)
            pad[ch]+=(np.sin(ph)+0.25*np.sin(2*ph)+0.08*np.sin(3*ph))*e*0.045
    fb=hz(notes[0]); pad+=(0.14*np.sin(2*np.pi*fb*t)+0.04*np.sin(4*np.pi*fb*t))*e
pad*=np.clip(t/2.0,0,1)*(0.88+0.12*np.sin(2*np.pi*t/7.0))
def bell(buf,s,m,v,dec=1.4,pan=0.5):
    i0=int(s*SR)
    if i0>=N: return
    n=min(int(SR*4),N-i0); tt=np.arange(n)/SR; f=hz(m)
    x=(np.sin(2*np.pi*f*tt)+0.4*np.sin(2*np.pi*f*2.76*tt)*np.exp(-tt/0.3)+0.2*np.sin(2*np.pi*f*5.4*tt)*np.exp(-tt/0.12))*(1-np.exp(-tt/0.006))*np.exp(-tt/dec)*v
    buf[0,i0:i0+n]+=x*(1-pan)*2*.5; buf[1,i0:i0+n]+=x*pan*2*.5
bl=np.zeros((2,N))
for s,m,v in [(0.25,86,.03),(0.6,93,.02),(2.0,81,.05),(2.0,88,.04),(4.1,86,.035),(10.5,90,.03),(13.3,93,.03),(18.1,86,.03),(23.3,88,.025),(27.5,74,.05),(27.5,81,.04),(27.9,86,.04),(28.3,90,.035),(28.7,93,.03)]:
    bell(bl,s,m,v,pan=rng.uniform(.3,.7))
def swell(end,dur=1.3,g=0.05):
    i0=max(0,int((end-dur)*SR)); n=int(dur*SR*1.3); n=min(n,N-i0); tt=np.arange(n)/SR
    e=np.clip(tt/dur,0,1)**2.2*np.exp(-np.clip(tt-dur,0,None)/0.25)
    for ch in range(2):
        x=lp(rng.standard_normal(n),1500); x=x-lp(x,250); pad[ch,i0:i0+n]+=x*e*g
for end in (2.0,4.0,10.4,13.2,18.0,23.2,27.4): swell(end)
dry=pad+bl
ir_n=int(3.2*SR); ti=np.arange(ir_n)/SR; out=np.zeros_like(dry)
for ch in range(2):
    ir=lp(rng.standard_normal(ir_n)*np.exp(-ti/0.9),4000); ir/=np.sqrt((ir**2).sum())
    nfft=1<<int(np.ceil(np.log2(N+ir_n)))
    wet=np.fft.irfft(np.fft.rfft(dry[ch],nfft)*np.fft.rfft(ir,nfft),nfft)[:N]
    out[ch]=dry[ch]*0.7+wet*0.45
out=np.array([lp(out[0],7000),lp(out[1],7000)])
out*=np.clip(t/1.2,0,1)*np.clip((30-t)/2.2,0,1)
out=out/np.max(np.abs(out))*0.85
w=wave.open('../composition/assets/music/score.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out.T*32767).astype('<i2').tobytes()); w.close(); print('ok')
