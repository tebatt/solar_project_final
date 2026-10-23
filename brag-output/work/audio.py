import numpy as np, wave
SR=44100; T=21.0; N=int(SR*T); t=np.arange(N)/SR
rng=np.random.default_rng(7)
def hz(m): return 440*2**((m-69)/12)
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/SR); y=np.empty_like(x); s=0.0
    # vectorised-ish one pole via lfilter substitute
    from itertools import accumulate
    y=np.fromiter(accumulate(x,lambda s,v:(1-a)*v+a*s),float,len(x)); return y
# chords (midi), segments
segs=[(0,4.0,[45,57,61,64,68,71]),(4.0,8.5,[42,54,57,61,64,68]),(8.5,13.0,[38,50,57,61,64,66]),(13.0,17.0,[40,52,56,59,64,66]),(17.0,21.0,[45,57,61,64,68,71])]
L=np.zeros(N); R=np.zeros(N)
def env_seg(a,b,fade=0.7):
    e=np.clip((t-a+fade/2)/fade,0,1)*np.clip((b+fade/2-t)/fade,0,1); return e*e*(3-2*e)
pad=np.zeros((2,N))
for a,b,notes in segs:
    e=env_seg(a,b if b<21 else 30)
    for i,m in enumerate(notes[1:]):
        f=hz(m)
        for ch,det in ((0,-0.11),(1,0.13)):
            ph=2*np.pi*(f+det*f/100)*t+rng.uniform(0,6)
            v=np.sin(ph)+0.3*np.sin(2*ph)+0.12*np.sin(3*ph)
            pad[ch]+=v*e*0.05
    # bass
    fb=hz(notes[0]); pad+=0.11*np.sin(2*np.pi*fb*t)*e + 0.03*np.sin(4*np.pi*fb*t)*e
pad*= np.clip(t/1.2,0,1)
# slow breathing on pad
pad*=0.85+0.15*np.sin(2*np.pi*t/5.0)
# plucks
def pluck(buf,start,m,vel,dec=0.35,pan=0.5):
    f=hz(m); i0=int(start*SR); n=int(SR*1.6); tt=np.arange(n)/SR
    if i0>=N: return
    n=min(n,N-i0); tt=tt[:n]
    env=(1-np.exp(-tt/0.004))*np.exp(-tt/dec)
    v=(np.sin(2*np.pi*f*tt)+0.35*np.sin(4*np.pi*f*tt)*np.exp(-tt/0.08))*env*vel
    buf[0,i0:i0+n]+=v*(1-pan)*2*0.5; buf[1,i0:i0+n]+=v*pan*2*0.5
plk=np.zeros((2,N)); beat=60/96/2
pat=[1,3,2,4,1,3,2,5]
k=0; s=0.3
while s<17.0:
    notes=[n for a,b,n in segs if a<=s<b][0]
    m=notes[pat[k%8]]+12
    vel=0.045 if k%2 else 0.06
    pluck(plk,s,m,vel,pan=0.35 if k%2 else 0.65); s+=beat; k+=1
# outro sparse
for i,(s,m) in enumerate([(17.3,69),(17.6,73),(17.9,76),(18.2,80),(18.5,83)]): pluck(plk,s,m+0,0.05,dec=0.9,pan=0.3+0.1*i)
# sfx
sfx=np.zeros((2,N))
def swell(end,dur=0.7,g=0.06):
    i0=int((end-dur)*SR); n=int(dur*SR*1.25)
    nz=rng.standard_normal((2,n)); tt=np.arange(n)/SR
    e=np.clip(tt/dur,0,1)**2*np.exp(-np.clip(tt-dur,0,None)/0.12)
    for ch in range(2):
        x=lp(nz[ch],1800); x=x-lp(x,300)
        sfx[ch,i0:i0+n]+=x*e*g
for end in (4.0,8.5,13.0,17.0): swell(end)
chimes=[(0.35+0.28*k+0.25,[81,85,88,83,88][k]) for k in range(5)]+[(4.75+0.18*k+0.25,[78,81,85,88,90][k]) for k in range(5)]+[(9.2,86),(9.35,90),(14.9,88),(15.1,92)]
for s,m in chimes: pluck(sfx,s,m,0.022,dec=0.5,pan=0.5)
for m in (57,64,69,73,76): pluck(sfx,17.25,m,0.05,dec=2.2)
dry=pad+plk+sfx
# reverb
ir_n=int(2.4*SR); ti=np.arange(ir_n)/SR
out=np.zeros_like(dry)
for ch in range(2):
    ir=rng.standard_normal(ir_n)*np.exp(-ti/0.55); ir=lp(ir,4500); ir/=np.sqrt((ir**2).sum())
    nfft=1<<int(np.ceil(np.log2(N+ir_n)))
    wet=np.fft.irfft(np.fft.rfft(dry[ch],nfft)*np.fft.rfft(ir,nfft),nfft)[:N]
    out[ch]=dry[ch]*0.8+wet*0.32
out=lp(out[0],9000),lp(out[1],9000); out=np.array(out)
out*=np.clip((21.0-t)/1.0,0,1)
out=out/np.max(np.abs(out))*0.9; out=np.tanh(out*1.1)/np.tanh(1.1)*0.89
pcm=(out.T*32767).astype('<i2')
w=wave.open('music.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
print('ok')
