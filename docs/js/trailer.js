/* trailer.js — plays once per browser session, then removes itself */
'use strict';

if (sessionStorage.getItem('trailerPlayed')) {
  // already seen this session — do nothing
} else {
(function () {

/* ── Build overlay DOM ── */
const overlay = document.createElement('div');
overlay.id = 'trailerOverlay';
overlay.innerHTML =
  '<canvas id="trBgCanvas"></canvas>' +
  '<div id="trVignette"></div>' +
  '<div id="trScene"></div>' +
  '<canvas id="trTxCanvas"></canvas>' +
  '<div id="trFlash"></div>';
document.body.appendChild(overlay);

/* ══════════════════════════════════════════════════
   1.  PARTICLES
══════════════════════════════════════════════════ */
const bgC = document.getElementById('trBgCanvas');
const bgX = bgC.getContext('2d');
let W = bgC.width  = innerWidth;
let H = bgC.height = innerHeight;
addEventListener('resize', () => { W = bgC.width = innerWidth; H = bgC.height = innerHeight; });

const h2r = h => { const v=parseInt(h.slice(1),16); return [(v>>16)&255,(v>>8)&255,v&255]; };
const lerp = (a,b,t) => { const A=h2r(a),B=h2r(b); return `rgb(${~~(A[0]+(B[0]-A[0])*t)},${~~(A[1]+(B[1]-A[1])*t)},${~~(A[2]+(B[2]-A[2])*t)})`; };

let pCol='#2244cc', pFrom='#2244cc', pTo='#2244cc', pT0=0, pDur=1000;
const setPCol = (c,ms=1000) => { pFrom=pCol; pT0=performance.now(); pDur=ms; pTo=c; };

class Particle {
  constructor(burst=false,bx=0,by=0) {
    this.burst=burst;
    if(burst){ this.x=bx; this.y=by; const a=Math.random()*Math.PI*2,sp=3+Math.random()*7; this.vx=Math.cos(a)*sp; this.vy=Math.sin(a)*sp; this.life=1; this.decay=.013+Math.random()*.02; }
    else { this.x=Math.random()*W; this.y=Math.random()*H; this.vx=(Math.random()-.5)*.28; this.vy=-(0.2+Math.random()*.7); }
    this.r=1+Math.random()*2.2; this.a=.15+Math.random()*.5; this.col=null;
  }
  update() {
    if(this.burst){ this.x+=this.vx; this.y+=this.vy; this.vy+=.04; this.vx*=.97; this.life-=this.decay; return this.life>0; }
    this.x+=this.vx; this.y+=this.vy;
    if(this.y<-10){this.y=H+10;this.x=Math.random()*W;} if(this.x<-10)this.x=W+10; if(this.x>W+10)this.x=-10;
    return true;
  }
  draw(c) {
    bgX.globalAlpha=this.burst?this.a*this.life:this.a;
    const col=this.col||c; bgX.fillStyle=col; bgX.shadowBlur=5; bgX.shadowColor=col;
    bgX.beginPath(); bgX.arc(this.x,this.y,this.r,0,Math.PI*2); bgX.fill();
  }
}

let aps=[], bps=[];
const initP = () => { aps=Array.from({length:150},()=>new Particle()); };
const burst = (x,y,n,col='#ffd700') => { for(let i=0;i<n;i++){const p=new Particle(true,x,y);p.col=col;bps.push(p);} };

let _animRunning = true;
function tickP(now) {
  if(!_animRunning) return;
  const t=Math.min((now-pT0)/pDur,1); pCol=t<1?lerp(pFrom,pTo,t):pTo;
  bgX.clearRect(0,0,W,H); bgX.save(); bgX.shadowBlur=0;
  aps.forEach(p=>{p.update();p.draw(pCol);});
  bps=bps.filter(p=>{const a=p.update();if(a)p.draw(pCol);return a;});
  bgX.globalAlpha=1; bgX.shadowBlur=0; bgX.restore();
  requestAnimationFrame(tickP);
}

/* ══════════════════════════════════════════════════
   2.  AUDIO ENGINE
══════════════════════════════════════════════════ */
const Snd = (() => {
  let AC=null, master=null, mBus=null, sfx=null;
  let mGain=null;
  const ivals = new Set(), pOscs = new Set();

  const boot = () => {
    if(AC) return;
    AC=new(window.AudioContext||window.webkitAudioContext)();
    master=AC.createGain(); master.gain.value=0.8; master.connect(AC.destination);
    mBus=AC.createGain(); mBus.gain.value=0.48; mBus.connect(master);
    sfx=AC.createGain(); sfx.gain.value=1.0; sfx.connect(master);
  };

  const osc  = (type,freq)=>{ const o=AC.createOscillator(); o.type=type; o.frequency.value=freq; return o; };
  const gain = v=>{ const g=AC.createGain(); g.gain.value=v; return g; };
  const filt = (type,freq,q=1)=>{ const f=AC.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q; return f; };
  const noise = dur=>{ const b=AC.createBuffer(1,~~(AC.sampleRate*dur),AC.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; const s=AC.createBufferSource(); s.buffer=b; return s; };
  const rev = (dest,t=.28,fb=.4)=>{ const d=AC.createDelay(1); d.delayTime.value=t; const f=gain(fb),m=gain(.26); d.connect(f);f.connect(d);d.connect(m);m.connect(dest); return d; };

  const stopMusic = (ms=400) => {
    ivals.forEach(id=>clearInterval(id)); ivals.clear();
    const t=AC?AC.currentTime:0;
    pOscs.forEach(o=>{try{o.stop(t+0.04);}catch(e){}});pOscs.clear();
    if(!mGain) return;
    const g=mGain; mGain=null;
    if(AC){g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+ms/1000);}
    setTimeout(()=>{try{g.disconnect();}catch(e){}},ms+200);
  };

  const playScene = id => {
    if(!AC) return;
    stopMusic(300);
    const bus=AC.createGain(); bus.gain.value=0; bus.connect(mBus); mGain=bus;
    bus.gain.linearRampToValueAtTime(1,AC.currentTime+0.7);

    const pad = (freqs,g) => { try {
      const r=rev(bus,.28,.38);
      freqs.forEach((f,i)=>{
        [-7,0,7].forEach(d=>{
          const o=osc(i%2?'triangle':'sawtooth',f), gn=gain(g/3), lp=filt('lowpass',Math.min(f*9,18000));
          o.detune.value=d; o.connect(gn); gn.connect(lp); lp.connect(r);
          const lfo=osc('sine',.07+i*.03), lg=gain(g*.18); lfo.connect(lg); lg.connect(gn.gain);
          o.start(); lfo.start(); pOscs.add(o); pOscs.add(lfo);
        });
      }); } catch(e){}
    };

    const beat = (bpm,kG,hG) => { try {
      const step=60000/bpm; let b=0;
      const id=setInterval(()=>{
        if(!AC||!mGain){clearInterval(id);ivals.delete(id);return;}
        const t=AC.currentTime;
        if(b%4===0||b%4===2){try{const o=osc('sine',100),g=gain(kG);o.frequency.setValueAtTime(100,t);o.frequency.exponentialRampToValueAtTime(26,t+.13);g.gain.setValueAtTime(kG,t);g.gain.exponentialRampToValueAtTime(.001,t+.19);o.connect(g);g.connect(bus);o.start(t);o.stop(t+.22);}catch(e){}}
        if(hG>0){try{const n=noise(.06),hp=filt('highpass',7000),eg=gain(1);eg.gain.setValueAtTime(hG,t);eg.gain.exponentialRampToValueAtTime(.001,t+.05);n.connect(eg);eg.connect(hp);hp.connect(bus);n.start(t);}catch(e){}}
        b++;
      },step); ivals.add(id); } catch(e){}
    };

    const arp = (notes,g) => { try {
      const r=rev(bus,.15,.35); let i=0;
      const id=setInterval(()=>{
        if(!AC||!mGain){clearInterval(id);ivals.delete(id);return;}
        try{const t=AC.currentTime,f=notes[i%notes.length],o=osc('triangle',f),gn=gain(g);gn.gain.setValueAtTime(g,t);gn.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(gn);gn.connect(r);o.start(t);o.stop(t+.28);i++;}catch(e){}
      },170); ivals.add(id); } catch(e){}
    };

    const bass = (root,g) => { try {
      const bpm=140,step=60000/bpm; let b=0; const notes=[1,1,1.5,1,1,1,.75,1];
      const id=setInterval(()=>{
        if(!AC||!mGain){clearInterval(id);ivals.delete(id);return;}
        try{const t=AC.currentTime,f=root*notes[b%notes.length],o=osc('square',f),gn=gain(g),lp=filt('lowpass',210);gn.gain.setValueAtTime(g,t);gn.gain.exponentialRampToValueAtTime(.001,t+step/1000*.7);o.connect(gn);gn.connect(lp);lp.connect(bus);o.start(t);o.stop(t+step/1000);b++;}catch(e){}
      },step/2); ivals.add(id); } catch(e){}
    };

    const M={
      logo:    ()=>pad([65.4,98,130.8],.06),
      ranks:   ()=>{pad([55,110],.04);beat(130,.25,.08);},
      skins:   ()=>arp([329,392,523,659],.07),
      crates:  ()=>{pad([41,55],.04);beat(140,.28,.10);bass(41,.11);},
      trading: ()=>{pad([87.3,130.8,174.6],.05);beat(120,.15,.06);},
      market:  ()=>pad([73.4,110,146.8],.04),
      profiles:()=>{pad([65.4,130.8,196.2],.06);beat(120,.13,.05);},
      rotation:()=>pad([49,73.4],.05),
      finale:  ()=>{pad([82.4,164.8,246.9],.07);beat(140,.34,.12);bass(41,.15);},
    };
    if(M[id]) M[id]();
  };

  const impact = (pw=1) => { try { if(!AC)return; const t=AC.currentTime,o=osc('sine',88*pw),g=gain(.8); o.frequency.setValueAtTime(88*pw,t);o.frequency.exponentialRampToValueAtTime(16,t+.35); g.gain.setValueAtTime(.8,t);g.gain.exponentialRampToValueAtTime(.001,t+.42); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.45); const n=noise(.2),ng=gain(.4),hp=filt('highpass',180); ng.gain.setValueAtTime(.4,t);ng.gain.exponentialRampToValueAtTime(.001,t+.18); n.connect(ng);ng.connect(hp);hp.connect(sfx);n.start(t); }catch(e){} };
  const whoosh = (up=true,dur=.5) => { try { if(!AC)return; const t=AC.currentTime,n=noise(dur+.1),g=gain(.25),bp=filt('bandpass',up?180:5000,1.3); bp.frequency.setValueAtTime(up?180:5000,t);bp.frequency.exponentialRampToValueAtTime(up?5000:180,t+dur); g.gain.setValueAtTime(.25,t);g.gain.linearRampToValueAtTime(0,t+dur); n.connect(g);g.connect(bp);bp.connect(sfx);n.start(t); }catch(e){} };
  const tick   = () => { try { if(!AC)return; const t=AC.currentTime,o=osc('sine',1100),g=gain(.10); g.gain.setValueAtTime(.10,t);g.gain.exponentialRampToValueAtTime(.001,t+.06); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.07); }catch(e){} };
  const crateLid = () => { try { if(!AC)return; const t=AC.currentTime,o=osc('sine',310),g=gain(.15); o.frequency.setValueAtTime(310,t);o.frequency.exponentialRampToValueAtTime(660,t+.09);o.frequency.exponentialRampToValueAtTime(350,t+.20); g.gain.setValueAtTime(.15,t);g.gain.exponentialRampToValueAtTime(0,t+.25); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.27); whoosh(true,.4); }catch(e){} };
  const ping   = () => { try { if(!AC)return; const t=AC.currentTime; [880,1320].forEach((f,i)=>{const o=osc('sine',f),g=gain(.09);g.gain.setValueAtTime(.09,t+i*.06);g.gain.exponentialRampToValueAtTime(.001,t+i*.06+.10);o.connect(g);g.connect(sfx);o.start(t+i*.06);o.stop(t+i*.06+.12);}); }catch(e){} };
  const glitchSfx = () => { try { if(!AC)return; const t=AC.currentTime; for(let i=0;i<6;i++){const o=osc('square',100+Math.random()*2200),g=gain(.06);g.gain.setValueAtTime(.06,t+i*.04);g.gain.setValueAtTime(0,t+i*.04+.03);o.connect(g);g.connect(sfx);o.start(t+i*.04);o.stop(t+i*.04+.035);} const n=noise(.28),ng=gain(.18);ng.gain.setValueAtTime(.18,t);ng.gain.linearRampToValueAtTime(0,t+.26);n.connect(ng);ng.connect(sfx);n.start(t); }catch(e){} };
  const slashSfx = () => { try { if(!AC)return; whoosh(true,.38); const t=AC.currentTime,o=osc('sawtooth',580),g=gain(.12),lp=filt('lowpass',3000); o.frequency.setValueAtTime(580,t);o.frequency.exponentialRampToValueAtTime(50,t+.38); g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(0,t+.40); o.connect(g);g.connect(lp);lp.connect(sfx);o.start(t);o.stop(t+.43); }catch(e){} };
  const zoomSfx  = () => { try { impact(1.5); if(!AC)return; const t=AC.currentTime,o=osc('sine',190),g=gain(.48); o.frequency.setValueAtTime(190,t);o.frequency.exponentialRampToValueAtTime(14,t+.50); g.gain.setValueAtTime(.48,t);g.gain.exponentialRampToValueAtTime(.001,t+.55); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.58); }catch(e){} };
  const warpSfx  = () => { try { if(!AC)return; whoosh(true,.46); const t=AC.currentTime,o=osc('sawtooth',40),g=gain(.15); o.frequency.setValueAtTime(40,t);o.frequency.exponentialRampToValueAtTime(7500,t+.48); g.gain.setValueAtTime(.15,t);g.gain.exponentialRampToValueAtTime(.001,t+.50); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.53); setTimeout(()=>{try{if(!AC)return;const tt=AC.currentTime,o2=osc('sine',52),g2=gain(.5);g2.gain.setValueAtTime(.5,tt);g2.gain.exponentialRampToValueAtTime(.001,tt+.20);o2.connect(g2);g2.connect(sfx);o2.start(tt);o2.stop(tt+.22);}catch(e){}},500); }catch(e){} };
  const staticSfx= () => { try { if(!AC)return; const t=AC.currentTime,n=noise(.68),g=gain(.42); g.gain.setValueAtTime(.42,t);g.gain.linearRampToValueAtTime(0,t+.66); n.connect(g);g.connect(sfx);n.start(t); }catch(e){} };
  const chromaSfx= () => { try { if(!AC)return; const t=AC.currentTime; [399,400,401].forEach((f,i)=>{const o=osc('sawtooth',f*4),g=gain(.05);o.detune.setValueAtTime(0,t);o.detune.linearRampToValueAtTime(1100*(i-1),t+.46);o.detune.linearRampToValueAtTime(0,t+.56);g.gain.setValueAtTime(.05,t);g.gain.linearRampToValueAtTime(0,t+.58);o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.60);}); }catch(e){} };
  const scanSfx  = () => { try { if(!AC)return; const t=AC.currentTime,o=osc('sine',600),g=gain(.10); o.frequency.setValueAtTime(600,t);o.frequency.linearRampToValueAtTime(1400,t+.50); g.gain.setValueAtTime(.10,t);g.gain.exponentialRampToValueAtTime(.001,t+.52); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.55); }catch(e){} };
  const waveSfx  = () => { try { if(!AC)return; const t=AC.currentTime,o=osc('sine',52),g=gain(.95); o.frequency.setValueAtTime(52,t);o.frequency.exponentialRampToValueAtTime(11,t+.85); g.gain.setValueAtTime(.95,t);g.gain.exponentialRampToValueAtTime(.001,t+.92); o.connect(g);g.connect(sfx);o.start(t);o.stop(t+.96); const n=noise(.12),ng=gain(.55); ng.gain.setValueAtTime(.55,t);ng.gain.exponentialRampToValueAtTime(.001,t+.10); n.connect(ng);ng.connect(sfx);n.start(t); }catch(e){} };
  const sovereignSfx = () => { try { impact(1.9); if(!AC)return; const t=AC.currentTime; [130.8,196.2,261.6,392,523.2].forEach((f,i)=>{try{const o=osc('sawtooth',f),g=gain(.09),lp=filt('lowpass',f*4);g.gain.setValueAtTime(0,t+i*.04);g.gain.linearRampToValueAtTime(.09,t+i*.04+.10);g.gain.linearRampToValueAtTime(0,t+i*.04+.85);o.connect(g);g.connect(lp);lp.connect(sfx);o.start(t);o.stop(t+1.0);}catch(e){}}); }catch(e){} };
  const boomSfx  = () => { try { waveSfx(); if(!AC)return; const t=AC.currentTime; [82.4,164.8,246.9,329.6,493.9].forEach((f,i)=>setTimeout(()=>{try{if(!AC)return;const tt=AC.currentTime,o=osc('sawtooth',f),g=gain(.09),lp=filt('lowpass',f*5);g.gain.setValueAtTime(.09,tt);g.gain.linearRampToValueAtTime(0,tt+1.4);o.connect(g);g.connect(lp);lp.connect(sfx);o.start(tt);o.stop(tt+1.6);}catch(e){}},i*65)); }catch(e){} };

  return { boot, playScene, stopMusic, impact, whoosh, tick, crateLid, ping, glitchSfx, slashSfx, zoomSfx, warpSfx, staticSfx, chromaSfx, scanSfx, waveSfx, sovereignSfx, boomSfx, get _ac(){return AC;} };
})();

/* ══════════════════════════════════════════════════
   3.  HELPERS
══════════════════════════════════════════════════ */
const SC      = document.getElementById('trScene');
const flashEl = document.getElementById('trFlash');
const txC     = document.getElementById('trTxCanvas');
const txX     = txC.getContext('2d');
const resizeTx = () => { txC.width=innerWidth; txC.height=innerHeight; };
resizeTx(); addEventListener('resize', resizeTx);

const wait = ms => new Promise(r => setTimeout(r, ms));

let epoch = 0;
const alive = e => e === epoch;
const wg = (ms, e) => new Promise(r => {
  let done=false;
  const finish = () => { if(!done){done=true;r();} };
  const t = setTimeout(finish, ms);
  const c = setInterval(() => { if(!alive(e)){clearTimeout(t);clearInterval(c);finish();} }, 80);
  setTimeout(() => clearInterval(c), ms+200);
});

function mk(tag, css={}, txt='') {
  const e=document.createElement(tag);
  Object.assign(e.style, css);
  if(txt) e.textContent=txt;
  return e;
}
const fadeOut = (el,ms=400) => new Promise(r=>{el.style.transition=`opacity ${ms}ms ease`;el.style.opacity='0';setTimeout(r,ms);});
const fadeIn  = (el,ms=400) => new Promise(r=>{el.style.opacity='0';el.style.transition=`opacity ${ms}ms ease`;requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.opacity='1';setTimeout(r,ms);}));});

function shake(intensity=4, dur=320) {
  const s=performance.now();
  const tick=n=>{const t=(n-s)/dur;if(t>=1){overlay.style.transform='';return;}const d=1-t;overlay.style.transform=`translate(${(Math.random()-.5)*2*intensity*d}px,${(Math.random()-.5)*2*intensity*d}px)`;requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
}
function flash(col='white',ms=300){flashEl.style.background=col;flashEl.style.transition='none';flashEl.style.opacity='1';setTimeout(()=>{flashEl.style.transition=`opacity ${ms}ms ease`;flashEl.style.opacity='0';},40);}
function countUp(el,target,dur=1300){const s=performance.now();const t=n=>{const p=Math.min((n-s)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(target*e).toLocaleString();if(p<1)requestAnimationFrame(t);else el.textContent=target.toLocaleString();};requestAnimationFrame(t);}
function clearSC(){SC.innerHTML='';}
function snd(fn,...args){try{fn(...args);}catch(e){}}

/* ══════════════════════════════════════════════════
   4.  CANVAS TRANSITIONS
══════════════════════════════════════════════════ */
const ease = {in:t=>t*t, out:t=>1-(1-t)*(1-t), io:t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2};
const anim = (dur,fn) => new Promise(r=>{const s=performance.now();const tick=n=>{const t=Math.min((n-s)/dur,1);fn(t);if(t<1)requestAnimationFrame(tick);else r();};requestAnimationFrame(tick);});
const txShow = () => txC.style.opacity='1';
const txHide = () => { txC.style.opacity='0'; txX.clearRect(0,0,txC.width,txC.height); };

async function transGlitch(){
  snd(Snd.glitchSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(700,t=>{
    txX.clearRect(0,0,cw,ch);
    if(t<.68){
      const sh=18*Math.sin(t*Math.PI*9)*(1-t);
      txX.globalAlpha=.4*(1-t/.68); txX.fillStyle='#f00'; txX.fillRect(-sh,0,cw,ch); txX.fillStyle='#00f'; txX.fillRect(sh,0,cw,ch); txX.globalAlpha=1;
      txX.fillStyle='rgba(0,0,0,.5)'; for(let y=0;y<ch;y+=4)if(Math.random()<.36)txX.fillRect(0,y,cw,2);
      if(Math.random()<.38){const by=Math.random()*ch,bh=2+Math.random()*16,bx=(Math.random()-.5)*36;txX.fillStyle=`rgba(255,255,255,${.07+Math.random()*.16})`;txX.fillRect(bx,by,cw,bh);}
    } else {const p=(t-.68)/.32;txX.fillStyle=`rgba(10,14,26,${ease.in(p)})`;txX.fillRect(0,0,cw,ch);}
  }); txHide();
}

async function transSlash(){
  snd(Snd.slashSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(420,t=>{
    txX.clearRect(0,0,cw,ch);
    const p=ease.io(t),cx2=p*(cw+260)-130,w=100+50*Math.sin(t*Math.PI);
    const g=txX.createLinearGradient(cx2-w,0,cx2+w,0);
    g.addColorStop(0,'transparent');g.addColorStop(.35,'rgba(0,229,255,.16)');g.addColorStop(.5,'rgba(255,255,255,.88)');g.addColorStop(.65,'rgba(255,215,0,.2)');g.addColorStop(1,'transparent');
    txX.save();txX.translate(cw/2,ch/2);txX.rotate(-0.27);txX.translate(-cw/2,-ch/2);txX.fillStyle=g;txX.fillRect(cx2-w,-200,w*2,ch+400);txX.restore();
    if(t>.08){txX.fillStyle=`rgba(0,229,255,${.06*(1-t)})`;txX.fillRect(0,0,cx2*.5,ch);}
  });
  await anim(280,t=>{txX.clearRect(0,0,cw,ch);txX.fillStyle=`rgba(10,14,26,${ease.in(t)})`;txX.fillRect(0,0,cw,ch);}); txHide();
}

async function transZoom(){
  snd(Snd.zoomSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(480,t=>{
    txX.clearRect(0,0,cw,ch);
    const s=1+ease.in(t)*3.6,ox=(cw-(cw*s))/2,oy=(ch-(ch*s))/2;
    txX.save();txX.translate(cw/2,ch/2);txX.scale(s,s);txX.translate(-cw/2,-ch/2);
    txX.fillStyle=`rgba(10,14,26,${ease.out(t)})`;txX.fillRect(ox,oy,cw,ch);txX.restore();
    if(t>.5){txX.fillStyle=`rgba(10,14,26,${ease.in((t-.5)*2)})`;txX.fillRect(0,0,cw,ch);}
  }); txHide();
}

async function transWarp(){
  snd(Snd.warpSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(500,t=>{
    txX.clearRect(0,0,cw,ch);
    const cx=cw/2,cy=ch/2,r=Math.max(cw,ch)*ease.in(t)*1.5;
    const g=txX.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,'rgba(10,14,26,1)');g.addColorStop(.7,'rgba(10,14,26,.6)');g.addColorStop(1,'transparent');
    txX.fillStyle=g;txX.fillRect(0,0,cw,ch);
    const w2=ease.in(t)*cw*.08;
    txX.fillStyle=`rgba(0,229,255,${.12*(1-t)})`;txX.fillRect(cx-w2,0,w2*2,ch);
  });
  await anim(320,t=>{txX.clearRect(0,0,cw,ch);txX.fillStyle=`rgba(10,14,26,${ease.io(t)})`;txX.fillRect(0,0,cw,ch);}); txHide();
}

async function transStatic(){
  snd(Snd.staticSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(680,t=>{
    txX.clearRect(0,0,cw,ch);
    if(t<.72){
      const a=.6*(1-t/.72);
      for(let y=0;y<ch;y+=2){ txX.fillStyle=`rgba(${~~(Math.random()*255)},${~~(Math.random()*255)},${~~(Math.random()*255)},${a*.4})`; txX.fillRect(0,y,cw,1); }
      txX.fillStyle=`rgba(0,0,0,${a*.7})`; txX.fillRect(0,0,cw,ch);
    } else {const p=(t-.72)/.28;txX.fillStyle=`rgba(10,14,26,${ease.in(p)})`;txX.fillRect(0,0,cw,ch);}
  }); txHide();
}

async function transChroma(){
  snd(Snd.chromaSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(580,t=>{
    txX.clearRect(0,0,cw,ch);
    if(t<.65){
      const sh=36*ease.in(t),a=.5*(1-t/.65);
      txX.globalAlpha=a; txX.fillStyle='#f00'; txX.fillRect(-sh,0,cw,ch); txX.fillStyle='#0ff'; txX.fillRect(sh,0,cw,ch); txX.globalAlpha=1;
    } else {const p=(t-.65)/.35;txX.fillStyle=`rgba(10,14,26,${ease.in(p)})`;txX.fillRect(0,0,cw,ch);}
  }); txHide();
}

async function transScan(){
  snd(Snd.scanSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(540,t=>{
    txX.clearRect(0,0,cw,ch);
    if(t<.7){
      const y=ease.io(t)*ch,lh=4+8*(1-t);
      txX.fillStyle='rgba(0,0,0,.55)'; txX.fillRect(0,0,cw,ch);
      for(let i=0;i<ch;i+=4){txX.fillStyle=`rgba(0,229,255,${.04*(1-t)})`;txX.fillRect(0,i,cw,2);}
      txX.fillStyle=`rgba(0,229,255,${.7*(1-t)})`;txX.fillRect(0,y-lh/2,cw,lh);
    } else {const p=(t-.7)/.3;txX.fillStyle=`rgba(10,14,26,${ease.in(p)})`;txX.fillRect(0,0,cw,ch);}
  }); txHide();
}

async function transWave(){
  snd(Snd.waveSfx);
  txShow(); const cw=txC.width,ch=txC.height;
  await anim(340,t=>{txX.clearRect(0,0,cw,ch);txX.fillStyle=`rgba(10,14,26,${ease.io(t)*.5})`;txX.fillRect(0,0,cw,ch);
    const cx=cw/2,cy=ch/2,r=Math.max(cw,ch)*ease.out(t)*1.4,th=12*(1-t);
    const rg=txX.createRadialGradient(cx,cy,Math.max(0,r-th),cx,cy,r+10);rg.addColorStop(0,'transparent');rg.addColorStop(.3,`rgba(255,215,0,${.7*(1-t)})`);rg.addColorStop(.7,`rgba(255,255,255,${.88*(1-t)})`);rg.addColorStop(1,'transparent');txX.fillStyle=rg;txX.fillRect(0,0,cw,ch);
  });
  await anim(380,t=>{txX.clearRect(0,0,cw,ch);txX.fillStyle=t<.35?`rgba(255,255,255,${t/.35})`:`rgba(10,14,26,${(t-.35)/.65})`;txX.fillRect(0,0,cw,ch);}); txHide();
}

/* ══════════════════════════════════════════════════
   5.  SCENE ENGINE
══════════════════════════════════════════════════ */
const SCENES = [
  {id:'logo',     dur:6000,     enter:s1, trans:transGlitch},
  {id:'ranks',    dur:20000,    enter:s2, trans:transSlash  },
  {id:'skins',    dur:14000,    enter:s3, trans:transZoom   },
  {id:'crates',   dur:11000,    enter:s4, trans:transWarp   },
  {id:'trading',  dur:9000,     enter:s5, trans:transStatic },
  {id:'market',   dur:9000,     enter:s6, trans:transChroma },
  {id:'profiles', dur:12000,    enter:s7, trans:transScan   },
  {id:'rotation', dur:6500,     enter:s8, trans:transWave   },
  {id:'finale',   dur:Infinity, enter:s9, trans:null        },
];
let si=0, stimer=null;

async function advance(){
  if(stimer){clearTimeout(stimer);stimer=null;}
  epoch++;
  const outT=SCENES[si].trans; si++;
  if(si>=SCENES.length) return;
  try{if(Snd._ac&&Snd._ac.state==='suspended')await Snd._ac.resume();}catch(e){}
  if(outT) await outT();
  clearSC(); SC.style.opacity='1';
  SCENES[si].enter();
  if(SCENES[si].dur!==Infinity) stimer=setTimeout(advance, SCENES[si].dur);
}

/* ══════════════════════════════════════════════════
   6.  RANK BADGES  (uses rankBadgeSvg from ranked.js)
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   7.  SKIN & CRATE DATA
══════════════════════════════════════════════════ */
const SKINS=[
  {name:'Entropy',        rarity:'Mythic',    rc:'#ff00ff',grad:'radial-gradient(circle at 35% 35%,#ff00ff,#2200dd 40%,#cc1100)',         dom:'#ff00ff'},
  {name:'Void Big Bang',  rarity:'Mythic',    rc:'#ff00ff',grad:'radial-gradient(circle at 50% 50%,#fff 0%,#4400ff 18%,#000033 55%)',    dom:'#4400ff'},
  {name:'Neon Synthwave', rarity:'Legendary', rc:'#ffd700',grad:'linear-gradient(135deg,#ff00aa,#ff6600 35%,#ffcc00 65%,#00ffcc)',         dom:'#ff00aa'},
  {name:'Ob Apocalypse',  rarity:'Oblivion',  rc:'#ff2200',grad:'radial-gradient(circle at 55% 40%,#ff4400,#880000 35%,#1a0000 70%)',     dom:'#ff3300'},
  {name:'Absolute Zero',  rarity:'Legendary', rc:'#ffd700',grad:'radial-gradient(circle at 40% 40%,#fff,#aaeeff 30%,#33aacc 65%,#001122)',dom:'#aaeeff'},
  {name:'Dimension Rift', rarity:'Mythic',    rc:'#ff00ff',grad:'conic-gradient(from 0deg,#0000ff,#ff00ff,#00ffff,#ff00ff,#0000ff)',      dom:'#00ffff'},
  {name:'Solar Flare',    rarity:'Legendary', rc:'#ffd700',grad:'radial-gradient(circle,#fff 0%,#ffdd00 18%,#ff6600 48%,#cc1100 78%,#220000)',dom:'#ffaa00'},
  {name:'Event Horizon',  rarity:'Legendary', rc:'#ffd700',grad:'radial-gradient(circle at 50% 50%,#000 0%,#220044 28%,#440088 50%)',     dom:'#440088'},
];
const CRATES=[
  {name:'Neon Crate',     color:'#00e5ff',icon:'⚡',price:'1,200',bg:'linear-gradient(135deg,#001a2e,#003344)'},
  {name:'Frost Crate',    color:'#aaeeff',icon:'❄️', price:'1,500',bg:'linear-gradient(135deg,#0a1a2e,#0d2040)'},
  {name:'Infernal Crate', color:'#ff4500',icon:'🔥',price:'2,000',bg:'linear-gradient(135deg,#2a0800,#1a0400)'},
  {name:'Void Crate',     color:'#8800ff',icon:'🌀',price:'2,500',bg:'linear-gradient(135deg,#0a0020,#1a0044)'},
];

/* ══════════════════════════════════════════════════
   8.  SCENES
══════════════════════════════════════════════════ */

// ── 1: Logo ──
async function s1(){
  const E=epoch; snd(Snd.playScene,'logo'); setPCol('#3366ff',1800);
  const w=mk('div',{textAlign:'center'});
  const title=mk('div',{fontSize:'clamp(34px,7vw,82px)',fontWeight:'900',color:'white',letterSpacing:'4px',textShadow:'0 0 30px #4488ff,0 0 70px #1133aa',opacity:'0',transition:'opacity 1.1s ease,transform 1.1s ease',transform:'scale(.93)'},'TOPDOWN ACTION');
  const sub=mk('div',{fontSize:'clamp(10px,1.7vw,20px)',color:'#ffd700',letterSpacing:'8px',marginTop:'20px',fontWeight:'700',opacity:'0',transition:'opacity .8s ease'},'SEASON ONE UPDATE');
  w.appendChild(title); w.appendChild(sub); SC.appendChild(w);
  await wg(600,E); if(!alive(E)) return;
  title.style.opacity='1'; title.style.transform='scale(1)';
  await wg(2600,E); if(!alive(E)) return;
  sub.style.opacity='1';
}

// ── 2: Ranks ──
async function s2(){
  const E=epoch; snd(Snd.playScene,'ranks'); setPCol('#ffd700',1800);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',width:'100%',gap:'20px'});
  SC.appendChild(w);
  const hdr=mk('div',{fontSize:'clamp(28px,6vw,66px)',fontWeight:'900',color:'white',animation:'tr-slam .55s cubic-bezier(.175,.885,.32,1.275) forwards',letterSpacing:'6px',textShadow:'0 0 24px rgba(255,255,255,.7)'},'NEW RANKS');
  w.appendChild(hdr); shake(6,400); flash('rgba(255,255,255,.4)',340); burst(W/2,H/2,35,'#ffd700'); snd(Snd.impact,1);
  await wg(1800,E); if(!alive(E)) return;

  const row=mk('div',{display:'flex',gap:'clamp(8px,1.8vw,20px)',alignItems:'center',justifyContent:'center',flexWrap:'wrap',padding:'0 10px'});
  w.appendChild(row);
  const tiers=['bronze','silver','gold','platinum','diamond','master','grandmaster','apex','sovereign'];
  for(const tid of tiers){
    await wg(640,E); if(!alive(E)) return;
    snd(Snd.tick);
    const cfg=RANKED_CONFIG[tid];
    // Scale badges up ~1.4x; extra margin compensates for transform not affecting layout
    const cell=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',
      animation:'tr-bounceIn .5s cubic-bezier(.175,.885,.32,1.275) forwards',
      transform:'scale(1.4)',transformOrigin:'center center',margin:'14px 10px'});
    cell.innerHTML=rankBadgeSvg(tid);
    cell.appendChild(mk('div',{fontSize:'clamp(6px,.9vw,10px)',letterSpacing:'2px',fontWeight:'700',color:cfg.color,textTransform:'uppercase'},cfg.label));
    row.appendChild(cell);
    if(tid==='sovereign'){
      await wg(150,E); if(!alive(E)) return;
      flash('white',750); shake(9,560); setPCol('#ffffff',300); burst(W/2,H/2,65,'#ffffff');
      hdr.style.textShadow='0 0 50px white,0 0 100px rgba(255,255,255,.44)';
      snd(Snd.sovereignSfx);
      await wg(1400,E); if(!alive(E)) return;
    }
  }

  // Badges stay visible — "BRONZE TO SOVEREIGN" fades in right underneath them
  await wg(600,E); if(!alive(E)) return;
  const end=mk('div',{fontSize:'clamp(14px,3vw,38px)',fontWeight:'900',textAlign:'center',background:'linear-gradient(90deg,#cd7f32,#c0c0c0,#ffd700,#fff)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:'4px',opacity:'0',transition:'opacity .7s ease'},'BRONZE TO SOVEREIGN');
  w.appendChild(end); await wg(60,E); if(!alive(E)) return; end.style.opacity='1';
  // Hold until scene timer fires the transition — no early fadeout
}

// ── 3: Skins ──
async function s3(){
  const E=epoch; snd(Snd.playScene,'skins'); setPCol('#ff00ff',1600);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'18px',width:'100%'});
  SC.appendChild(w);

  const hw=mk('div',{textAlign:'center'});
  const hi=mk('div',{animation:'tr-slideInL .5s ease forwards'});
  hi.innerHTML=`<span style="color:#ffd700;font-size:clamp(26px,5.5vw,56px);font-weight:900">40</span><span style="color:white;font-size:clamp(26px,5.5vw,56px);font-weight:900"> NEW SKINS</span>`;
  const ul=mk('div',{height:'3px',background:'#ffd700',width:'0',transition:'width .8s ease',marginTop:'8px',borderRadius:'2px'});
  hw.appendChild(hi); hw.appendChild(ul); w.appendChild(hw);

  const pa=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'14px'});
  const pw=mk('div',{position:'relative',width:'190px',height:'190px'});
  const circ=mk('div',{width:'190px',height:'190px',borderRadius:'50%'});
  const rng=mk('div',{position:'absolute',top:'-10px',left:'-10px',right:'-10px',bottom:'-10px',borderRadius:'50%',border:'3px solid #ff00ff',boxShadow:'0 0 22px #ff00ff',animation:'tr-pulseGlow 1.5s ease-in-out infinite',pointerEvents:'none'});
  pw.appendChild(circ); pw.appendChild(rng);
  const sname=mk('div',{fontSize:'clamp(13px,2vw,20px)',fontWeight:'700',color:'white',letterSpacing:'2px'});
  const rtag=mk('div',{padding:'4px 16px',borderRadius:'4px',fontSize:'10px',letterSpacing:'3px',fontWeight:'700',textTransform:'uppercase',border:'1px solid'});
  pa.appendChild(pw); pa.appendChild(sname); pa.appendChild(rtag); w.appendChild(pa);

  let skinIdx=0;
  const showSkin=i=>{ const s=SKINS[i]; circ.style.background=s.grad; circ.style.boxShadow=`0 0 50px ${s.dom},0 0 90px ${s.dom}55`; rng.style.borderColor=s.rc; rng.style.boxShadow=`0 0 22px ${s.rc},0 0 44px ${s.rc}44`; sname.textContent=s.name; rtag.textContent=s.rarity; rtag.style.color=s.rc; rtag.style.borderColor=s.rc; rtag.style.background=`${s.rc}18`; setPCol(s.dom,600); };
  showSkin(0);
  await wg(280,E); if(!alive(E)) return; ul.style.width='100%';
  const iv=setInterval(()=>{ if(!alive(E)){clearInterval(iv);return;} pa.style.transition='opacity .3s ease'; pa.style.opacity='0'; setTimeout(()=>{ skinIdx=(skinIdx+1)%SKINS.length; showSkin(skinIdx); pa.style.opacity='1'; },300); },1260);
  await wg(10600,E); clearInterval(iv); if(!alive(E)) return;

  pa.style.transition='transform .5s ease,opacity .5s ease'; pa.style.transform='scale(2.2)'; pa.style.opacity='0';
  hw.style.transition='opacity .4s ease'; hw.style.opacity='0';
  burst(W/2,H/2,50,SKINS[skinIdx].dom);
  await wg(600,E); if(!alive(E)) return;
  const end=mk('div',{fontSize:'clamp(11px,2vw,20px)',letterSpacing:'6px',color:'white',fontWeight:'400',textAlign:'center',opacity:'0',transition:'opacity .5s ease'},'COLLECT THEM ALL');
  w.appendChild(end); await wg(60,E); if(!alive(E)) return; end.style.opacity='1';
}

// ── 4: Crates ──
async function s4(){
  const E=epoch; snd(Snd.playScene,'crates'); setPCol('#ff4500',1500);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'26px',width:'100%'});
  SC.appendChild(w);
  const hdr=mk('div',{fontSize:'clamp(28px,6vw,64px)',fontWeight:'900',color:'white',animation:'tr-slam .55s cubic-bezier(.175,.885,.32,1.275) forwards',letterSpacing:'6px',textShadow:'0 0 24px rgba(255,255,255,.7)'},'NEW CRATES');
  w.appendChild(hdr); shake(6,380); flash('rgba(255,255,255,.45)',290); snd(Snd.impact,1.1);
  await wg(1800,E); if(!alive(E)) return;

  const row=mk('div',{display:'flex',gap:'clamp(10px,2.4vw,26px)',justifyContent:'center',flexWrap:'wrap',alignItems:'flex-end'});
  w.appendChild(row);
  CRATES.forEach((cr,i)=>setTimeout(()=>{ if(!alive(E)) return;
    const cell=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'10px',animation:'tr-bounceIn .5s ease forwards'});
    const box=mk('div',{width:'88px',height:'90px',position:'relative',perspective:'400px'});
    const lid=mk('div',{position:'absolute',top:'0',left:'-4px',width:'96px',height:'26px',borderRadius:'6px',background:cr.bg,border:`2px solid ${cr.color}`,boxShadow:`0 0 14px ${cr.color}88`,transformOrigin:'top center',transition:'transform .55s ease'});
    const body=mk('div',{position:'absolute',bottom:'0',width:'88px',height:'68px',borderRadius:'8px',background:cr.bg,border:`2px solid ${cr.color}`,boxShadow:`0 0 20px ${cr.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px'},cr.icon);
    const beam=mk('div',{position:'absolute',bottom:'68px',left:'33px',width:'22px',height:'0',background:`linear-gradient(to top,${cr.color},transparent)`,opacity:'0',boxShadow:`0 0 8px ${cr.color}`,transition:'height .45s ease,opacity .45s ease',zIndex:'5'});
    box.appendChild(beam); box.appendChild(lid); box.appendChild(body);
    cell.appendChild(box);
    cell.appendChild(mk('div',{fontSize:'8px',letterSpacing:'2px',color:cr.color,fontWeight:'700',textTransform:'uppercase',textAlign:'center'},cr.name));
    cell.appendChild(mk('div',{fontSize:'10px',color:'rgba(255,255,255,.42)',letterSpacing:'1px'},cr.price+' coins'));
    row.appendChild(cell);
    setTimeout(()=>{ if(!alive(E)) return; lid.style.transform='rotateX(-55deg)'; beam.style.height='160px'; beam.style.opacity='.75'; snd(Snd.crateLid); setTimeout(()=>{ beam.style.opacity='0'; burst(W/2+(i-1.5)*120,H*.38,18,cr.color); },500); },400);
  },i*520));

  await wg(6600,E); if(!alive(E)) return;
  await Promise.all([fadeOut(row,340),fadeOut(hdr,330)]); if(!alive(E)) return;
  const end=mk('div',{textAlign:'center',opacity:'0',transition:'opacity .5s ease'});
  end.innerHTML=`<span style="color:#ef4444;font-size:clamp(12px,2vw,20px);letter-spacing:4px;font-weight:700">LIMITED STOCK</span><span style="color:rgba(255,255,255,.22);margin:0 14px;font-size:clamp(12px,2vw,20px)">•</span><span style="color:#ffd700;font-size:clamp(12px,2vw,20px);letter-spacing:4px;font-weight:700">ROTATING SHOP</span>`;
  w.appendChild(end); await wg(60,E); if(!alive(E)) return; end.style.opacity='1';
}

// ── 5: Trading ──
async function s5(){
  const E=epoch; snd(Snd.playScene,'trading'); setPCol('#22c55e',1500);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'26px',width:'100%',maxWidth:'800px',padding:'0 20px'});
  SC.appendChild(w);

  const hr=mk('div',{display:'flex',gap:'14px',alignItems:'center',justifyContent:'center',flexWrap:'wrap'});
  w.appendChild(hr);
  const words=[{t:'BUY',c:'#22c55e'},{t:'•',c:'rgba(255,255,255,.2)'},{t:'HOLD',c:'#ffd700'},{t:'•',c:'rgba(255,255,255,.2)'},{t:'TRADE',c:'#00e5ff'}];
  const wels=words.map(wd=>{ const e=mk('div',{fontSize:'clamp(20px,4.5vw,50px)',fontWeight:'900',color:wd.c,letterSpacing:'3px',textShadow:`0 0 20px ${wd.c}`,opacity:'0',transition:'opacity .35s ease'},wd.t); hr.appendChild(e); return e; });
  for(const e of wels){ await wg(360,E); if(!alive(E)) return; e.style.opacity='1'; if(e.textContent!=='•') snd(Snd.impact,.38); }
  await wg(480,E); if(!alive(E)) return;

  const split=mk('div',{display:'flex',gap:'18px',width:'100%',justifyContent:'center',alignItems:'flex-start',flexWrap:'wrap'});
  const left=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'10px',flex:'1',maxWidth:'220px',animation:'tr-slideInL .5s ease forwards'});
  left.appendChild(mk('div',{fontSize:'9px',letterSpacing:'4px',color:'rgba(255,255,255,.38)',padding:'7px 20px',border:'1px solid rgba(255,255,255,.1)',borderRadius:'4px'},'SHOP'));
  const crI=mk('div',{width:'58px',height:'58px',borderRadius:'8px',background:'linear-gradient(135deg,#001a2e,#003344)',border:'2px solid #00e5ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'26px',boxShadow:'0 0 18px #00e5ff44',transition:'transform 1.7s ease'},'📦');
  left.appendChild(crI);
  left.appendChild(mk('div',{fontSize:'20px',color:'rgba(255,255,255,.25)',margin:'2px 0'},'↓'));
  left.appendChild(mk('div',{padding:'10px 18px',border:'1px solid rgba(255,255,255,.12)',borderRadius:'8px',background:'rgba(255,255,255,.03)',fontSize:'9px',letterSpacing:'3px',color:'rgba(255,255,255,.42)',textAlign:'center'},'INVENTORY'));

  const right=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'12px',flex:'1',maxWidth:'240px',animation:'tr-slideInR .5s ease .22s forwards'});
  right.appendChild(mk('div',{fontSize:'9px',letterSpacing:'3px',color:'rgba(255,255,255,.38)',padding:'7px 14px',border:'1px solid rgba(255,255,255,.1)',borderRadius:'4px'},'PEER TRADING'));
  const tr=mk('div',{display:'flex',gap:'14px',alignItems:'center'});
  const dot=g=>mk('div',{width:'42px',height:'42px',borderRadius:'50%',background:g.bg,border:`2px solid ${g.c}`,boxShadow:`0 0 14px ${g.c}55`});
  tr.appendChild(dot({bg:'linear-gradient(135deg,#4488ff,#003399)',c:'#4488ff'}));
  tr.appendChild(mk('div',{fontSize:'22px',animation:'tr-floatUD 1.3s ease-in-out infinite'},'📦'));
  tr.appendChild(dot({bg:'linear-gradient(135deg,#aa44ff,#550099)',c:'#aa44ff'}));
  right.appendChild(tr);
  const mc=mk('div',{padding:'12px',border:'1px solid rgba(255,215,0,.22)',borderRadius:'8px',background:'rgba(255,215,0,.04)',width:'100%'});
  mc.innerHTML=`<div style="font-size:8px;color:#ffd700;letter-spacing:2px;margin-bottom:6px">MARKETPLACE LISTING</div><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;color:white">Entropy</span><span style="font-size:13px;color:#22c55e;font-weight:700">4,200 🪙</span></div><div style="font-size:8px;color:rgba(255,255,255,.32);margin-top:4px">Mythic • xX_NEXUS_Xx</div><div style="margin-top:10px;padding:5px 12px;background:#22c55e18;border:1px solid #22c55e44;border-radius:4px;text-align:center;font-size:8px;color:#22c55e;letter-spacing:2px">BUY NOW</div>`;
  right.appendChild(mc);
  split.appendChild(left); split.appendChild(right); w.appendChild(split);
  setTimeout(()=>{ if(alive(E)) crI.style.transform='translateY(58px)'; },1200);

  await wg(4600,E); if(!alive(E)) return;
  await fadeOut(w,430); if(!alive(E)) return;
  const fin=mk('div',{fontSize:'clamp(13px,2.7vw,24px)',fontWeight:'700',color:'white',letterSpacing:'5px',textAlign:'center',opacity:'0',transition:'opacity .5s ease'},'YOUR CRATES. YOUR MARKET.');
  SC.appendChild(fin); await wg(60,E); if(!alive(E)) return; fin.style.opacity='1';
}

// ── 6: Market ──
async function s6(){
  const E=epoch; snd(Snd.playScene,'market'); setPCol('#22c55e',1200);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'20px',width:'100%',maxWidth:'680px',padding:'0 20px'});
  SC.appendChild(w);
  w.appendChild(mk('div',{fontSize:'clamp(14px,3vw,30px)',fontWeight:'700',color:'white',letterSpacing:'4px',animation:'tr-slideInL .5s ease forwards',textAlign:'center'},'REAL-TIME MARKET DATA'));
  await wg(1800,E); if(!alive(E)) return;

  const cb=mk('div',{background:'rgba(0,0,0,.55)',border:'1px solid rgba(255,255,255,.07)',borderRadius:'10px',padding:'18px 20px',width:'100%'});
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox','0 0 580 180'); svg.setAttribute('width','100%'); svg.setAttribute('height','150');
  [10,55,100,145].forEach(y=>{const l=document.createElementNS(NS,'line');l.setAttribute('x1','0');l.setAttribute('y1',y);l.setAttribute('x2','580');l.setAttribute('y2',y);l.setAttribute('stroke','rgba(255,255,255,.05)');l.setAttribute('stroke-width','1');svg.appendChild(l);});
  const pts=[[0,155],[55,130],[110,142],[170,108],[230,122],[290,88],[350,103],[420,68],[490,45],[580,28]];
  const ps=pts.map(p=>p.join(',')).join(' ');
  const ar=document.createElementNS(NS,'polyline'); ar.setAttribute('points',ps+' 580,180 0,180'); ar.setAttribute('fill','rgba(34,197,94,.07)'); svg.appendChild(ar);
  const ln=document.createElementNS(NS,'polyline'); ln.setAttribute('points',ps); ln.setAttribute('fill','none'); ln.setAttribute('stroke','#22c55e'); ln.setAttribute('stroke-width','2.8'); ln.setAttribute('stroke-linecap','round'); ln.setAttribute('stroke-linejoin','round'); ln.setAttribute('stroke-dasharray','950'); ln.setAttribute('stroke-dashoffset','950'); ln.style.animation='tr-chartLine 3s ease forwards'; svg.appendChild(ln);
  pts.forEach((p,i)=>{const c=document.createElementNS(NS,'circle');c.setAttribute('cx',p[0]);c.setAttribute('cy',p[1]);c.setAttribute('r','3.5');c.setAttribute('fill','#22c55e');c.style.opacity='0';c.style.animation=`tr-fadeIn .2s ease ${.26*i+.2}s forwards`;svg.appendChild(c);});
  cb.appendChild(svg);

  const sr=mk('div',{display:'flex',gap:'14px',marginTop:'12px',justifyContent:'center',flexWrap:'wrap'});
  const tb=mk('div',{background:'#22c55e1a',border:'1px solid #22c55e44',borderRadius:'4px',padding:'4px 14px',fontSize:'10px',color:'#22c55e',letterSpacing:'2px',fontWeight:'700',opacity:'0',transition:'opacity .5s ease 3s'},'↑ TRENDING UP');
  const wt=mk('div',{fontSize:'10px',color:'rgba(255,255,255,.38)',letterSpacing:'2px',opacity:'0',transition:'opacity .5s ease 3.3s'},'47 sold this week  •  12 listed');
  sr.appendChild(tb); sr.appendChild(wt); cb.appendChild(sr); w.appendChild(cb);

  const sg=mk('div',{fontSize:'clamp(11px,1.8vw,16px)',color:'rgba(255,255,255,.55)',letterSpacing:'3px',opacity:'0',transition:'opacity .5s ease',textAlign:'center'});
  sg.innerHTML='Suggested: <span style="color:#ffd700;font-weight:700">4,200 coins</span>';
  w.appendChild(sg);
  setTimeout(()=>{ if(alive(E)){tb.style.opacity='1';wt.style.opacity='1';snd(Snd.whoosh,true,.32);} },3100);
  setTimeout(()=>{ if(alive(E)) sg.style.opacity='1'; },5400);
}

// ── 7: Profiles ──
async function s7(){
  const E=epoch; snd(Snd.playScene,'profiles'); setPCol('#4488ff',1500);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'20px',width:'100%'});
  SC.appendChild(w);
  const hdr=mk('div',{fontSize:'clamp(20px,4.5vw,48px)',fontWeight:'900',color:'white',letterSpacing:'6px',animation:'tr-fadeIn .6s ease forwards',textAlign:'center'},'LEAVE YOUR MARK');
  w.appendChild(hdr);
  await wg(1600,E); if(!alive(E)) return;
  hdr.style.transition='opacity .4s ease,transform .4s ease'; hdr.style.opacity='.22'; hdr.style.transform='scale(.9) translateY(-8px)';

  const cr=mk('div',{display:'flex',gap:'18px',justifyContent:'center',flexWrap:'wrap'});
  w.appendChild(cr);

  const makeCard=({bg,bc,gc,sg,un,ti,rank,k,wi,g,bgs,dir,del})=>{
    const card=mk('div',{width:'clamp(215px,27vw,280px)',border:`2px solid ${bc}`,borderRadius:'12px',padding:'18px',background:bg,boxShadow:`0 0 28px ${gc}44`,position:'relative',overflow:'hidden',animation:`${dir==='right'?'tr-slideInR':'tr-slideInL'} .55s ease ${del}ms forwards`});
    const shim=mk('div',{position:'absolute',top:'-50%',left:'-60%',width:'45%',height:'200%',background:'rgba(255,255,255,.03)',transform:'skewX(-14deg)',animation:'tr-shimmer 5s ease-in-out infinite',pointerEvents:'none'});
    card.appendChild(shim);
    const top=mk('div',{display:'flex',gap:'12px',alignItems:'center',marginBottom:'14px'});
    const av=mk('div',{width:'50px',height:'50px',borderRadius:'50%',background:sg,border:`2px solid ${bc}`,boxShadow:`0 0 14px ${gc}66`,flexShrink:'0'});
    const info=mk('div',{});
    info.appendChild(mk('div',{fontSize:'11px',fontWeight:'700',color:'white',letterSpacing:'1px'},un));
    const bw=mk('div',{marginTop:'4px',display:'inline-block',transform:'scale(0.52)',transformOrigin:'0 0',overflow:'visible',lineHeight:'0'}); bw.innerHTML=rankBadgeSvg(rank); info.appendChild(bw);
    top.appendChild(av); top.appendChild(info); card.appendChild(top);
    card.appendChild(mk('div',{fontSize:'12px',color:bc,letterSpacing:'2px',marginBottom:'12px',borderBottom:`1px solid ${bc}25`,paddingBottom:'10px'},ti));
    const stats=mk('div',{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'12px'});
    [{l:'KILLS',v:k},{l:'WINS',v:wi},{l:'GAMES',v:g}].forEach((s,i)=>{
      const cell=mk('div',{textAlign:'center'});
      const val=mk('div',{fontSize:'clamp(13px,2vw,17px)',fontWeight:'700',color:'white'},'0');
      cell.appendChild(val);
      cell.appendChild(mk('div',{fontSize:'7px',color:'rgba(255,255,255,.32)',letterSpacing:'2px',marginTop:'2px'},s.l));
      stats.appendChild(cell);
      setTimeout(()=>{ if(alive(E)) countUp(val,s.v,1200); },700+i*140+del);
    }); card.appendChild(stats);
    const bs=mk('div',{display:'flex',gap:'7px',justifyContent:'center'});
    bgs.forEach((b,i)=>{
      const bb=mk('div',{width:'28px',height:'28px',borderRadius:'6px',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',opacity:'0',transition:`opacity .3s ease ${680+i*130+del}ms`},b);
      bs.appendChild(bb); setTimeout(()=>{ if(alive(E)) bb.style.opacity='1'; },680+i*130+del);
    }); card.appendChild(bs);
    setTimeout(()=>{ if(alive(E)) card.style.animation+=',tr-floatUD 3.4s ease-in-out infinite'; },900+del);
    return card;
  };

  snd(Snd.whoosh,true,.5);
  cr.appendChild(makeCard({bg:'linear-gradient(135deg,#0a1a3e,#080c18)',bc:'#4488ff',gc:'#4488ff',sg:'radial-gradient(circle at 35% 35%,#ff00ff,#0000dd 40%,#cc1100)',un:'NEXUS_PRIME',ti:'Him.',rank:'apex',k:14827,wi:412,g:1890,bgs:['⚡','🔥','💎'],dir:'left',del:0}));
  await wg(1100,E); if(!alive(E)) return;
  snd(Snd.whoosh,true,.4);
  cr.appendChild(makeCard({bg:'linear-gradient(135deg,#180030,#08001a)',bc:'#a855f7',gc:'#a855f7',sg:'radial-gradient(circle at 50% 50%,#fff 0%,#4400ff 18%,#000033 55%)',un:'VOID_WEAVER',ti:'The Architect',rank:'grandmaster',k:9341,wi:287,g:1120,bgs:['👑','🌀','⚔️'],dir:'right',del:180}));

  await wg(7000,E); if(!alive(E)) return;
  await Promise.all([fadeOut(cr,380),fadeOut(hdr,360)]); if(!alive(E)) return;
  const fin=mk('div',{fontSize:'clamp(13px,2.7vw,24px)',fontWeight:'700',color:'#00e5ff',letterSpacing:'6px',textAlign:'center',opacity:'0',transition:'opacity .5s ease',textShadow:'0 0 20px #00e5ff'},'YOUR STATS. YOUR STORY.');
  SC.appendChild(fin); await wg(60,E); if(!alive(E)) return; fin.style.opacity='1';
}

// ── 8: Shop Rotation ──
async function s8(){
  const E=epoch; snd(Snd.playScene,'rotation'); setPCol('#ffd700',1200);
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'20px',width:'100%',maxWidth:'680px',padding:'0 16px'});
  SC.appendChild(w);

  const hr=mk('div',{display:'flex',gap:'12px',alignItems:'center',justifyContent:'center',animation:'tr-fadeIn .5s ease forwards'});
  const clk=mk('div',{fontSize:'clamp(18px,3vw,30px)'},'🕐');
  hr.appendChild(clk);
  hr.appendChild(mk('div',{fontSize:'clamp(16px,3.2vw,34px)',fontWeight:'700',color:'white',letterSpacing:'4px'},'SHOP ROTATIONS'));
  w.appendChild(hr);
  const faces=['🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛']; let cf=0;
  const civ=setInterval(()=>{ if(!alive(E)){clearInterval(civ);return;} clk.textContent=faces[cf%12]; if(cf%4===0) snd(Snd.tick); cf++; },200);

  await wg(1600,E); if(!alive(E)) return;

  const sr=mk('div',{display:'flex',gap:'14px',justifyContent:'center',flexWrap:'wrap'});
  const mkSlot=({name,icon,price,col,soldOut,stock,tag})=>{
    const s=mk('div',{width:'clamp(128px,17vw,163px)',border:`1px solid ${col}44`,borderRadius:'8px',padding:'14px',textAlign:'center',background:`${col}0a`,position:'relative',overflow:'hidden',animation:'tr-bounceIn .5s ease forwards'});
    s.appendChild(mk('div',{fontSize:'28px',marginBottom:'8px'},icon));
    s.appendChild(mk('div',{fontSize:'9px',color:col,letterSpacing:'2px',fontWeight:'700',textTransform:'uppercase',marginBottom:'5px'},name));
    s.appendChild(mk('div',{fontSize:'11px',color:'rgba(255,255,255,.42)',marginBottom:'8px'},price+' 🪙'));
    if(soldOut){const ov=mk('div',{position:'absolute',inset:'0',background:'rgba(239,68,68,.2)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'8px'});ov.appendChild(mk('div',{fontSize:'11px',fontWeight:'700',color:'#ef4444',letterSpacing:'2px',border:'2px solid #ef4444',padding:'4px 8px',borderRadius:'4px',transform:'rotate(-12deg)'},'SOLD OUT'));s.appendChild(ov);}
    else if(stock!=null){const bar=mk('div',{height:'3px',background:'rgba(255,255,255,.07)',borderRadius:'2px',overflow:'hidden'});const fill=mk('div',{height:'100%',width:`${stock}%`,background:col,borderRadius:'2px',transition:'width 2.6s ease'});bar.appendChild(fill);s.appendChild(bar);setTimeout(()=>{if(alive(E))fill.style.width=`${Math.max(stock-24,4)}%`;},1000);}
    if(tag)s.appendChild(mk('div',{position:'absolute',top:'-8px',left:'50%',transform:'translateX(-50%)',background:col,fontSize:'7px',letterSpacing:'1px',padding:'2px 9px',borderRadius:'10px',fontWeight:'700',color:'white',whiteSpace:'nowrap'},tag));
    return s;
  };
  sr.appendChild(mkSlot({name:'Neon Crate',    icon:'⚡',price:'1,200',col:'#00e5ff',stock:68,tag:'Featured'}));
  sr.appendChild(mkSlot({name:'Void Crate',    icon:'🌀',price:'2,500',col:'#8800ff',soldOut:true}));
  sr.appendChild(mkSlot({name:'Infernal Crate',icon:'🔥',price:'2,000',col:'#ff4500',stock:28,tag:'Weekend Special'}));
  w.appendChild(sr);

  const cw2=mk('div',{textAlign:'center'});
  cw2.appendChild(mk('div',{fontSize:'10px',color:'rgba(255,255,255,.38)',letterSpacing:'3px',marginBottom:'6px'},'Refreshes in:'));
  const cEl=mk('div',{fontSize:'clamp(15px,2.8vw,22px)',fontWeight:'700',color:'#ffd700',letterSpacing:'4px'});
  cw2.appendChild(cEl); w.appendChild(cw2);
  let [cd,ch2,cm,cs]=[2,14,32,0];
  const fmt=()=>`${cd}d ${String(ch2).padStart(2,'0')}h ${String(cm).padStart(2,'0')}m ${String(cs).padStart(2,'0')}s`;
  cEl.textContent=fmt();
  const cntv=setInterval(()=>{ if(!alive(E)){clearInterval(cntv);return;} if(--cs<0){cs=59;if(--cm<0){cm=59;if(--ch2<0){ch2=23;cd--;}}} cEl.textContent=fmt(); },100);

  await wg(3500,E); clearInterval(civ); clearInterval(cntv); if(!alive(E)) return;
  await Promise.all([fadeOut(sr,330),fadeOut(cw2,330),fadeOut(hr,330)]); if(!alive(E)) return;
  const fin=mk('div',{fontSize:'clamp(12px,2vw,18px)',letterSpacing:'5px',color:'white',opacity:'0',transition:'opacity .5s ease',textAlign:'center'},'FRESH DROPS EVERY FEW DAYS');
  w.appendChild(fin); await wg(60,E); if(!alive(E)) return; fin.style.opacity='1';
}

// ── 9: Finale ──
async function s9(){
  const E=epoch; snd(Snd.playScene,'finale'); setPCol('#221100',100);
  SC.appendChild(mk('div',{}));
  await wg(2000,E); if(!alive(E)) return;
  flash('white',750); shake(11,620); burst(W/2,H/2,90,'#ffd700'); setPCol('#ffd700',900); snd(Snd.boomSfx);
  clearSC();
  const w=mk('div',{display:'flex',flexDirection:'column',alignItems:'center',gap:'16px',textAlign:'center',padding:'20px',width:'100%'});
  SC.appendChild(w);
  const title=mk('div',{fontSize:'clamp(34px,8vw,96px)',fontWeight:'900',color:'#ffd700',animation:'tr-slam .65s cubic-bezier(.175,.885,.32,1.275) forwards',letterSpacing:'4px',textShadow:'0 0 40px #ffd700,0 0 80px #cc8800'},'TOPDOWN ACTION');
  w.appendChild(title);
  await wg(520,E); if(!alive(E)) return;

  const fl=mk('div',{display:'flex',flexDirection:'column',gap:'6px',alignItems:'center'});
  w.appendChild(fl);
  const feats=['9 Ranked Tiers','40+ New Skins','4 New Crates','Live Marketplace','Profile Cards','Crate Trading'];
  for(const f of feats){
    await wg(270,E); if(!alive(E)) return;
    fl.appendChild(mk('div',{fontSize:'clamp(10px,1.4vw,14px)',color:'rgba(255,255,255,.78)',letterSpacing:'2px',fontWeight:'400',animation:'tr-slideInUp .3s ease forwards'},f));
    snd(Snd.tick);
  }
  await wg(1300,E); if(!alive(E)) return;
  fl.style.transition='opacity .5s ease'; fl.style.opacity='0';
  await wg(620,E); if(!alive(E)) return;

  const pn=mk('div',{
    fontSize:'clamp(22px,5vw,54px)',fontWeight:'900',color:'#ffd700',letterSpacing:'8px',
    display:'block',animation:'tr-pulseGlow 1.6s ease-in-out infinite,tr-fadeIn .6s ease forwards',
    textShadow:'0 0 30px #ffd700,0 0 60px #cc8800',cursor:'pointer',
    opacity:'0',transition:'transform .25s ease,text-shadow .25s ease'
  },'PLAY NOW');
  pn.addEventListener('mouseover',()=>{ pn.style.textShadow='0 0 60px #ffd700,0 0 120px #ffaa00'; pn.style.transform='scale(1.07)'; snd(Snd.ping); });
  pn.addEventListener('mouseout', ()=>{ pn.style.textShadow='0 0 30px #ffd700,0 0 60px #cc8800'; pn.style.transform='scale(1)'; });
  pn.addEventListener('click', () => {
    sessionStorage.setItem('trailerPlayed', '1');
    Snd.stopMusic(600);
    _animRunning = false;
    overlay.style.transition = 'opacity 0.6s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 650);
  });
  w.appendChild(pn); await wg(60,E); if(!alive(E)) return; pn.style.opacity='1';
}

/* ══════════════════════════════════════════════════
   9.  BOOT
══════════════════════════════════════════════════ */
initP();
requestAnimationFrame(tickP);

// Try to boot audio immediately (works if browser allows autoplay).
// If not, any interaction with the overlay will unlock it.
try { Snd.boot(); } catch(e) {}
overlay.addEventListener('pointerdown', () => {
  try { Snd.boot(); if(Snd._ac && Snd._ac.state === 'suspended') Snd._ac.resume(); } catch(e) {}
}, { once: true });

// Start from scene 0 (logo) immediately — no click-to-start
SCENES[0].enter();
if(SCENES[0].dur !== Infinity) stimer = setTimeout(advance, SCENES[0].dur);

})();
}
