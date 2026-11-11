/* BallBattlee Studio v16 — one sound per physical strand cut. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('battleCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: false });
  const TAU = Math.PI * 2, VW = 720, VH = 1280;
  const CENTER = { x: 360, y: 596, r: 330 };
  const WALL_STRING_BONUS = 11;
  const IMPACT_THREAD_SPREAD = .22;
  const FINAL_ACCELERATION_COUNT = 3;
  const COLLISION_GROWTH_FACTOR = 1.05;
  const COLLISION_SPEED_FACTOR = 1.08;
  const DUEL_GROWTH_FACTOR = 1.12;
  const DUEL_SPEED_FACTOR = 1.12;
  const DUEL_SEPARATION_TIME = .18;

  // Centralized Gameplay, Physics & Audio Parameters
  const INITIAL_CIRCLE_RADIUS = 48;
  const WALL_HIT_GROWTH_RATE = 0.018;
  const MAX_CIRCLE_GROWTH = 1.30;
  const GROWTH_ANIMATION_DURATION = 0.15;
  const MAX_PARTICIPANT_SPEED = 700;
  const SPEED_MULTIPLIERS = {
    phase1: 1.0,
    phase2: 1.3,
    phase3: 1.7,
    phase4: 2.15
  };
  const INACTIVITY_THRESHOLD = 7.0;
  const INACTIVITY_ACCELERATION = 0.05;
  const STRING_SOUND_MIN_INTERVAL = 0.055;
  const MAX_CONCURRENT_BREAK_SOUNDS = 2;

  // Auto Save & Persistence (localStorage for config, IndexedDB for assets)
  const STORAGE_KEY = 'ballbattlee_studio_v20_config';
  const STORAGE_VERSION = 20;
  const IDB_NAME = 'BallBattleeStudioDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'assets';
  const AUTOSAVE_DELAY_MS = 500;
  let autoSaveTimer = null, pendingSaveWhileRunning = false;
  let idbPromise = null;

  function getIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB init exception:', err);
        resolve(null);
      }
    });
    return idbPromise;
  }

  async function idbSet(key, val) {
    try {
      const db = await getIDB();
      if (!db) return false;
      return new Promise(resolve => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('idbSet exception:', e);
      return false;
    }
  }

  async function idbGet(key) {
    try {
      const db = await getIDB();
      if (!db) return null;
      return new Promise(resolve => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('idbGet exception:', e);
      return null;
    }
  }

  function getStoragePayload() {
    const rawCount = $('count') ? Number($('count').value) : 8;
    return {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      settings: {
        title: $('headline') ? $('headline').value.trim() : 'WHO WILL WIN?',
        duration: $('duration') ? Number($('duration').value) : 30,
        speed: $('speed') ? Number($('speed').value) : 1,
        count: [4, 6, 8, 10, 12].includes(rawCount) ? rawCount : 8,
        theme: $('theme') ? $('theme').value : 'neon',
        quality: $('quality') ? Number($('quality').value) : 1080,
        threads: $('threads') ? $('threads').checked : true,
        ripSounds: $('ripSounds') ? $('ripSounds').checked : true,
        density: $('density') ? Number($('density').value) : 110,
        cutDamage: $('cutDamage') ? Number($('cutDamage').value) : 3,
        slowmo: $('slowmo') ? $('slowmo').value : 'off',
        sfxVolume: $('sfxVolume') ? Number($('sfxVolume').value) : 75,
        musicVolume: $('musicVolume') ? Number($('musicVolume').value) : 35,
        cta: $('cta') ? $('cta').checked : true,
        guarantee: $('guarantee') ? $('guarantee').checked : false
      },
      slots: cachedSlotsPool.map(s => ({
        name: s.name,
        color: s.color,
        hasImage: Boolean(s.src)
      }))
    };
  }

  function doSaveSync() {
    try {
      const payload = getStoragePayload();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('AutoSave to localStorage failed:', e);
    }
  }

  async function doSave() {
    doSaveSync();
    try {
      const existingImages = (await idbGet('player_images')) || [];
      const mergedImages = [...existingImages];
      cachedSlotsPool.forEach((s, i) => {
        mergedImages[i] = s.src || null;
      });
      await idbSet('player_images', mergedImages);
    } catch (e) {
      console.warn('AutoSave images to IndexedDB failed:', e);
    }
  }

  function scheduleAutoSave(immediate = false) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (immediate && !simRunning) {
      persistState();
    } else {
      autoSaveTimer = setTimeout(persistState, AUTOSAVE_DELAY_MS);
    }
  }

  function persistState() {
    autoSaveTimer = null;
    if (simRunning) {
      pendingSaveWhileRunning = true;
      return;
    }
    pendingSaveWhileRunning = false;
    doSave();
  }

  const pairContacts = new Set();
  const colors = ['#f8c242','#e66c5b','#9a72ec','#42bafa','#25bd93','#f0f4fc','#ff9468','#27d1d0','#ff5ca8','#a9ca45','#ba92f5','#ffb950'];
  const stars = Array.from({length:130}, (_,i)=>({x:fract(Math.sin(i * 127.1) * 58372.1)*VW, y:fract(Math.sin(i * 62.7) * 32292.9)*VH, a: .10 + fract(Math.sin(i * 91.3) * 131.7)*.22,r: i%6===0?1.25:.55}));
  function fract(n){return n-Math.floor(n)}
  let slots = [], cachedSlotsPool = [];
  let imageCache = new Map();
  let balls = [], particles=[], rings=[], threads=[], announcements=[], ballThreads=[];
  let cutCount=0, stringsGained=0, musicAudio=null, musicSource=null, musicGain=null, musicObjectUrl=null;
  let elapsed = 0, simRunning=false, finished=false, winner=null, raf=0, lastStamp=0;
  const FIXED_DT = 1 / 120;
  let accumulator = 0, bgCanvas = null;
  let recorder=null, chunks=[], recording=false, finishedAt=-1;
  let audioContext=null, audioDestination=null, toastTimeout;
  // Realistic Taut String Audio Engine
  const NUM_SNAP_BUFFERS = 12;
  const MAX_CONCURRENT_SNAP_VOICES = 4;
  const SNAP_MICRO_SPACING = 0.016; // 16ms between audible snaps in a burst
  const MAX_BURST_QUEUE_LATENCY = 0.048; // 48ms maximum queue latency window

  let snapBuffers=[], ripBus=null, ripOutput=null, audioReady=Promise.resolve();
  let nextAvailableSnapTime=0, snapVariationCounter=0;
  const activeSnapVoices=[];
  let lastCollisionTime=0, lastEliminationTime=0, duelClock=0, mark=0;
  let colorTheme = 'neon';
  const config = () => ({
    title:$('headline').value.trim() || 'WHO WILL WIN?',
    duration:Number($('duration').value),
    speed:Number($('speed').value),
    theme:$('theme').value,
    guarantee:$('guarantee').checked,
    cta:$('cta').checked,
    threads:$('threads').checked,
    ripSounds:$('ripSounds').checked,
    density:Number($('density').value),
    cutDamage:Number($('cutDamage').value),
    slowmo:$('slowmo').value,
    sfxVolume:Number($('sfxVolume').value)/100,
    musicVolume:Number($('musicVolume').value)/100,
    count: Number($('count').value),
    quality: Number($('quality').value)
  });
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let seed=50483; const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}; const rand=(a=0,b=1)=>a+random()*(b-a);
  const alive=()=>balls.filter(b=>b.alive);
  function toast(message){let el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),4800)}
  function avatarText(label){
    if(/^PLAYER \d+$/.test(label))return label.slice(7);
    if(label.includes('🇺🇸'))return '🇺🇸';
    const flags = ['🇧🇷','🇦🇷','🇫🇷','🇯🇵','🇩🇪','🇪🇸','🇵🇹','🇮🇹','🇲🇽','🇨🇦'];
    for(const f of flags)if(label.includes(f))return f;
    return label.replace(/[^\p{L}\p{N} ]/gu,'').trim().slice(0,2).toUpperCase() || '?';
  }
  function cleanLabel(label){ return label.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]/gu,'').trim()||'Player'; }
  function defaultSlots(count=8){
    return Array.from({length:count},(_,i)=>({name:`PLAYER ${i+1}`,color:colors[i%colors.length],src:null}));
  }
  function resizeSlots(count){
    const defaults=defaultSlots(count);
    slots=defaults.map((def,i)=>cachedSlotsPool[i]||def);
    slots.forEach((s, idx) => { cachedSlotsPool[idx] = s; });
    makePlayerUI();reset();
    scheduleAutoSave(true);
  }
  function getImage(src){
    if(!src)return null;
    if(!imageCache.has(src)){
      const img=new Image();
      img.onload=()=>{
        balls.forEach(b=>{ if(b.src===src) b.faceSrc=null; });
        draw();
      };
      img.onerror=()=>imageCache.delete(src);
      img.src=src;imageCache.set(src,img);
    }
    const img=imageCache.get(src);return img?.complete&&img.naturalWidth?img:null;
  }
  function makePlayerUI(){
    const list=$('playersList');list.innerHTML='';
    slots.forEach((slot,i)=>{
      let cell=document.createElement('div');cell.className='player-input';cell.style.setProperty('--player',slot.color);
      let label=document.createElement('button');label.type='button';label.className='player-image';label.title='Upload picture for '+slot.name;label.setAttribute('aria-label',label.title);
      if(slot.src){const img=document.createElement('img');img.src=slot.src;img.alt='';label.appendChild(img);}else label.textContent=avatarText(slot.name);
      let inputFile=document.createElement('input');inputFile.type='file';inputFile.accept='image/*';inputFile.hidden=true;
      label.addEventListener('click',()=>inputFile.click());
      inputFile.addEventListener('change',async e=>{
        const file=e.target.files?.[0];if(!file)return;
        if(!file.type.startsWith('image/')){toast('Select an image file.');return;}
        if(file.size>12*1024*1024){toast('Please choose an image under 12 MB.');return;}
        try {
          slot.src=await resizeImage(file);
          if(cachedSlotsPool[i])cachedSlotsPool[i].src=slot.src;
          getImage(slot.src);makePlayerUI();reset();
          scheduleAutoSave(true);
          toast(`${slot.name}: picture added.`);
        }
        catch(e){console.error(e);toast('Could not load this image.');}
      });
      let info=document.createElement('div');info.className='player-cell';
      const number=document.createElement('div');number.className='playnum';number.textContent=`BALL ${String(i+1).padStart(2,'0')}`;
      const input=document.createElement('input');input.setAttribute('aria-label',`Ball ${i+1} name`);input.maxLength=20;input.value=slot.name;
      input.addEventListener('input',()=>{
        slot.name=input.value||'PLAYER';
        if(cachedSlotsPool[i])cachedSlotsPool[i].name=slot.name;
        let b=balls[i];if(b)b.name=slot.name;
        scheduleAutoSave();
      });
      info.append(number,input);cell.append(label,info,inputFile);list.appendChild(cell);
    });
  }
  async function resizeImage(file){
    const url=URL.createObjectURL(file);
    try {
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
      const cvs=document.createElement('canvas');cvs.width=cvs.height=220;
      let c=cvs.getContext('2d');const side=Math.min(img.naturalWidth,img.naturalHeight);
      const x=(img.naturalWidth-side)/2,y=(img.naturalHeight-side)/2;
      c.drawImage(img,x,y,side,side,0,0,220,220);
      return cvs.toDataURL('image/jpeg',.85);
    }finally{URL.revokeObjectURL(url)}
  }
  function makeBall(slot,i,total){
    const angle=-1.84+(i+.5)*TAU/total, radius=CENTER.r-INITIAL_CIRCLE_RADIUS-16;
    const x=slot.x??CENTER.x+Math.cos(angle)*radius,y=slot.y??CENTER.y+Math.sin(angle)*radius;
    const direction=Math.atan2(CENTER.y-y,CENTER.x-x)+rand(-.32,.32),speed=125*config().speed;
    return {
      name:slot.name,color:slot.color,src:slot.src,
      x,y,prevX:x,prevY:y,renderPrevX:x,renderPrevY:y,
      vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,
      hp:config().density,alive:true,
      r:INITIAL_CIRCLE_RADIUS,
      baseRadius:INITIAL_CIRCLE_RADIUS,
      targetR:INITIAL_CIRCLE_RADIUS,
      maxRadius:INITIAL_CIRCLE_RADIUS*MAX_CIRCLE_GROWTH,
      wallContact:false,duelSteerAfter:0,
      speedFloor:speed,nextThreadIndex:config().density,glow:0,trail:[],
      id:i,rotation:0,deathAt:null,lastCut:-10,
      wallHits:0,
      faceCanvas:null,faceRadius:0,faceName:'',faceSrc:null
    };
  }
  function setRunning(run){
    simRunning=run;
    $('playText').textContent=run?'Pause simulation':finished?'Replay simulation':'Start simulation';
    $('playIcon').textContent=run?'Ⅱ':'▶';
    if(!run && pendingSaveWhileRunning){
      pendingSaveWhileRunning=false;
      doSave();
    }
  }
  // Each fiber joins its moving owner to a fixed point on the arena rim.
  function createThreads(){
    const density=config().density;
    threads=[];
    ballThreads=Array.from({length:slots.length},()=>[]);
    for(let owner=0;owner<slots.length;owner++){
      for(let k=0;k<density;k++){
        const angle=-1.84+owner*TAU/slots.length+k*TAU/slots.length/density;
        const cosAngle=Math.cos(angle);
        const sinAngle=Math.sin(angle);
        const strand={
          owner,k,density,angle,cosAngle,sinAngle,
          bx:CENTER.x+cosAngle*(CENTER.r-1),
          by:CENTER.y+sinAngle*(CENTER.r-1),
          cutAt:-1,cutR:0,generation:k
        };
        threads.push(strand);
        ballThreads[owner].push(strand);
      }
    }
  }
  function addThreads(ball,count,impactAngle){
    if(!config().threads||!ball.alive)return 0;
    const owned=ballThreads[ball.id]||[];
    const broken=owned.filter(s=>s.cutAt>=0);
    const live=owned.filter(s=>s.cutAt<0).sort((a,b)=>(a.generation??a.k)-(b.generation??b.k));
    let born=0;
    // Refill missing fibers first. At capacity, move the oldest living fibers
    // to the new hit instead of accumulating unlimited HP and geometry.
    for(let i=0;i<count;i++){
      const strand=broken.shift()||live.shift();if(!strand)break;
      if(strand.cutAt>=0)ball.hp++;
      strand.angle=impactAngle+(count>1?i/(count-1)-.5:0)*IMPACT_THREAD_SPREAD;
      strand.cosAngle=Math.cos(strand.angle);
      strand.sinAngle=Math.sin(strand.angle);
      strand.bx=CENTER.x+strand.cosAngle*(CENTER.r-1);
      strand.by=CENTER.y+strand.sinAngle*(CENTER.r-1);
      strand.generation=ball.nextThreadIndex++;strand.cutAt=-1;strand.cutR=0;born++;
    }
    stringsGained+=born;
    return born;
  }
  function growBallWall(ball){
    if(!ball.alive)return;
    ball.wallHits++;
    if(alive().length===2){
      const duelMax=Math.min(110,CENTER.r*Math.sqrt(.45/2));
      ball.targetR=Math.min(ball.targetR*(1+WALL_HIT_GROWTH_RATE*1.5),duelMax);
    }else{
      ball.targetR=Math.min(ball.targetR*(1+WALL_HIT_GROWTH_RATE),ball.maxRadius);
    }
  }
  function growBall(ball,factor){
    // Rim and ball collision growth in final two
    if(alive().length!==2)return;
    const maxRadius=Math.min(110,CENTER.r*Math.sqrt(.45/2));
    ball.targetR=Math.max(ball.targetR,Math.min(ball.targetR*factor,maxRadius));
  }
  function boostBall(ball,beforeSpeed,cfg,factor=COLLISION_SPEED_FACTOR){
    const current=Math.hypot(ball.vx,ball.vy);
    ball.speedFloor=Math.min(MAX_PARTICIPANT_SPEED*cfg.speed,Math.max(ball.speedFloor,beforeSpeed,current)*factor);
    if(current>1e-8){ball.vx*=ball.speedFloor/current;ball.vy*=ball.speedFloor/current;}
    else{ball.vx=ball.speedFloor;ball.vy=0;}
  }
  function duelThreadAim(ball,opponent){
    if(duelClock<1||elapsed-ball.lastCut<1||!config().threads)return opponent;
    const cached=ball.duelThreadAim;
    if(cached&&cached.until>duelClock&&cached.strand.cutAt<0)return cached;
    const boundary=CENTER.r-ball.r-5,clearance=ball.r+opponent.r+5;
    const constrain=p=>{
      const dx=p.x-CENTER.x,dy=p.y-CENTER.y,d=Math.hypot(dx,dy);
      if(d>boundary){p.x=CENTER.x+dx/d*boundary;p.y=CENTER.y+dy/d*boundary;}
      return p;
    };
    let best=null;
    const oppThreads=ballThreads[opponent.id]||[];
    for(let i=0;i<oppThreads.length;i++){
      const strand=oppThreads[i];
      if(strand.cutAt>=0)continue;
      const g=strandGeometry(strand);if(!g)continue;
      for(const t of [.25,.55,.82]){
        const x=g.ax+g.dx*g.length*t,y=g.ay+g.dy*g.length*t;
        const radial=Math.atan2(CENTER.y-y,CENTER.x-x);
        for(const offset of [null,radial,Math.atan2(g.dy,g.dx)+Math.PI/2,Math.atan2(g.dy,g.dx)-Math.PI/2]){
          const goal=constrain({x:x+(offset===null?0:Math.cos(offset)*ball.r*.72),y:y+(offset===null?0:Math.sin(offset)*ball.r*.72)});
          if(Math.hypot(goal.x-opponent.x,goal.y-opponent.y)<clearance)continue;
          if(Math.hypot(goal.x-x,goal.y-y)>ball.r*.94)continue;
          const score=Math.hypot(goal.x-ball.x,goal.y-ball.y);
          if(!best||score<best.score)best={...goal,strand,score,until:duelClock+.22};
        }
      }
    }
    if(!best){
      const strand=oppThreads.find(s=>s.cutAt<0);
      if(!strand)return opponent;
      const angle=Math.atan2(ball.y-opponent.y,ball.x-opponent.x)+(ball.id<opponent.id?.7:-.7);
      best={...constrain({x:opponent.x+Math.cos(angle)*(clearance+8),y:opponent.y+Math.sin(angle)*(clearance+8)}),strand,until:duelClock+.22};
    }
    ball.duelThreadAim=best;
    return best;
  }
  function steerDuel(active,dt){
    if(active.length!==2)return;
    duelClock+=dt;
    const key=(Math.min(active[0].id,active[1].id)<<8)|Math.max(active[0].id,active[1].id);
    if(pairContacts.has(key))return;
    for(let i=0;i<2;i++){
      const ball=active[i],opponent=active[1-i];
      if(duelClock<ball.duelSteerAfter)continue;
      let target=duelThreadAim(ball,opponent);
      const clearance=ball.r+opponent.r+5;
      if(target!==opponent){
        const dx=target.x-ball.x,dy=target.y-ball.y,length=dx*dx+dy*dy;
        const t=length?clamp(((opponent.x-ball.x)*dx+(opponent.y-ball.y)*dy)/length,0,1):0;
        if(Math.hypot(ball.x+dx*t-opponent.x,ball.y+dy*t-opponent.y)<clearance){
          const currentAngle=Math.atan2(ball.y-opponent.y,ball.x-opponent.x),goalAngle=Math.atan2(target.y-opponent.y,target.x-opponent.x);
          const delta=Math.atan2(Math.sin(goalAngle-currentAngle),Math.cos(goalAngle-currentAngle));
          const side=Math.abs(delta)<.05?(ball.id<opponent.id?1:-1):Math.sign(delta);
          const angle=currentAngle+side*.65;
          target={x:opponent.x+Math.cos(angle)*(clearance+8),y:opponent.y+Math.sin(angle)*(clearance+8)};
          const ox=target.x-CENTER.x,oy=target.y-CENTER.y,d=Math.hypot(ox,oy),limit=CENTER.r-ball.r-5;
          if(d>limit){target.x=CENTER.x+ox/d*limit;target.y=CENTER.y+oy/d*limit;}
        }
      }
      const speed=Math.hypot(ball.vx,ball.vy);
      const current=Math.atan2(ball.vy,ball.vx),desired=Math.atan2(target.y-ball.y,target.x-ball.x);
      const difference=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
      const turnRate=Math.max(4.5,speed/Math.max(20,ball.r*.65));
      const angle=current+clamp(difference,-turnRate*dt,turnRate*dt);
      ball.vx=Math.cos(angle)*speed;ball.vy=Math.sin(angle)*speed;
    }
  }
  function resolveWall(ball){
    const dx=ball.x-CENTER.x,dy=ball.y-CENTER.y,dist=Math.hypot(dx,dy)||1;
    let boundary=CENTER.r-ball.r-3;
    if(dist<boundary-4)ball.wallContact=false;
    if(dist<=boundary)return;
    const nx=dx/dist,ny=dy/dist,vdot=ball.vx*nx+ball.vy*ny;
    if(vdot>0){
      if(!ball.wallContact){
        growBallWall(ball);addThreads(ball,WALL_STRING_BONUS,Math.atan2(ny,nx));
        ball.wallContact=true;
      }
      ball.vx-=1.88*vdot*nx;ball.vy-=1.88*vdot*ny;
    }
    boundary=CENTER.r-ball.r-3;
    ball.x=CENTER.x+nx*boundary;ball.y=CENTER.y+ny*boundary;
    ball.glow=1;
  }
  function strandGeometry(strand,usePrevious=false){
    const b=balls[strand.owner];if(!b)return null;
    const x=usePrevious?b.prevX:b.x,y=usePrevious?b.prevY:b.y;
    const bx=strand.bx,by=strand.by;
    const length=Math.hypot(bx-x,by-y);
    if(length<=b.r+1)return null;
    const inv=1/length;
    const dx=(bx-x)*inv,dy=(by-y)*inv;
    return {ax:x+dx*b.r,ay:y+dy*b.r,bx,by,dx,dy,length:length-b.r};
  }
  function reset(autoStart=false){
    if(recording&&!autoStart)return toast('Stop recording before resetting.');
    stopRip();
    seed=50483;elapsed=0;finished=false;winner=null;finishedAt=-1;lastCollisionTime=0;lastEliminationTime=0;duelClock=0;pairContacts.clear();stringsGained=0;mark=0;particles=[];rings=[];announcements=[];cutCount=0;
    accumulator=0;
    if(musicAudio){musicAudio.pause();musicAudio.currentTime=0;if(autoStart)startMusic();}
    balls=slots.map((slot,i)=>makeBall(slot,i,slots.length));createThreads();
    initBgCanvas();
    setRunning(autoStart);updateStats();draw(1);
    if(pendingSaveWhileRunning){
      pendingSaveWhileRunning=false;
      doSave();
    }
  }
  function updateStats(){
    const total=slots.length,num=alive().length;
    $('aliveLabel').textContent=`${num} alive`;
    $('remainingValue').textContent=`${num} / ${total}`;
    $('eliminatedValue').textContent=String(total-num);
    $('stringsValue').textContent=String(threads.filter(t=>t.cutAt<0).length)+' / '+threads.length;
    $('cutCountValue').textContent=String(cutCount);
    $('stringsGainedValue').textContent=String(stringsGained);
    $('winnerValue').textContent=winner?cleanLabel(winner.name).slice(0,16):'Pending';
    const secs=Math.floor(Math.min(elapsed,config().duration));
    $('timerLabel').textContent=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
    const dur=config().duration;$('durationLabel').textContent=`${Math.floor(dur/60)}:${String(dur%60).padStart(2,'0')}`;
    $('timelineProgress').style.width=`${clamp(elapsed/dur*100,0,100)}%`;
  }
  function initSnapBuffers(ac) {
    if (snapBuffers.length === NUM_SNAP_BUFFERS) return;
    snapBuffers = [];
    const sampleRate = ac.sampleRate || 48000;
    const duration = 0.095; // 95 ms - fast, crisp taut snap
    const numSamples = Math.floor(sampleRate * duration);

    for (let v = 0; v < NUM_SNAP_BUFFERS; v++) {
      const audioBuf = ac.createBuffer(1, numSamples, sampleRate);
      const channel = audioBuf.getChannelData(0);

      // Micro-variation parameters based on thin high-tension filament acoustics
      const baseTension = 1.0 + ((v % 5) - 2) * 0.035;
      const fStart = (2750 + ((v * 197) % 380)) * baseTension;
      const fEnd = (1420 + ((v * 131) % 190)) * baseTension;
      const pitchDecayTime = 0.013 + ((v * 37) % 6) * 0.001; // 13-18 ms pitch dive
      const amplitudeDecay = 0.042 + ((v * 59) % 8) * 0.002; // 42-56 ms decay
      const snapBrightness = 0.52 + ((v * 73) % 5) * 0.04;

      let phase1 = 0;
      let phase2 = 0;
      let prevNoise = 0;

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;

        // 1. Initial rupture impulse (sharp high-frequency snap, first 2.5 ms)
        const whiteNoise = (Math.random() * 2 - 1);
        const snapCrack = whiteNoise - prevNoise * 0.82;
        prevNoise = whiteNoise;
        const crackEnv = Math.exp(-t / 0.0022); // 2.2 ms decay
        const transient = snapCrack * crackEnv * snapBrightness;

        // 2. Initial micro-shockwave (first 1.2 ms asymmetric pulse)
        let shockwave = 0;
        if (t < 0.0012) {
          shockwave = Math.sin((t / 0.0012) * Math.PI) * 0.42;
        }

        // 3. Elastic tension dive ("TWING" body)
        const curFreq = fEnd + (fStart - fEnd) * Math.exp(-t / pitchDecayTime);
        phase1 += (2 * Math.PI * curFreq) / sampleRate;

        // Dispersion overtone (second transverse mode, slightly inharmonic)
        const overtoneFreq = curFreq * 2.38;
        phase2 += (2 * Math.PI * overtoneFreq) / sampleRate;

        const bodyWave = Math.sin(phase1 + 0.3 * Math.sin(2 * phase1));
        const s2 = Math.sin(phase2);
        const overtoneEnv = Math.exp(-t / 0.018); // overtone decays rapidly

        const bodySignal = (bodyWave * 0.72 + s2 * 0.28 * overtoneEnv);

        // Amplitude envelope: instant attack (<0.4 ms), exponential decay
        const attack = Math.min(1, t / 0.0004);
        const mainEnv = attack * Math.exp(-t / amplitudeDecay);

        // Clean tail fade-out to guarantee 0 DC and 0 clicks
        const tailFade = t > (duration - 0.008) ? (duration - t) / 0.008 : 1.0;

        let sample = (transient + shockwave + bodySignal * mainEnv) * tailFade;
        sample = Math.tanh(sample * 1.35) * 0.82;

        channel[i] = sample;
      }

      snapBuffers.push(audioBuf);
    }
  }

  function ensureAudio(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioContext){
      audioContext=new AC();
      initSnapBuffers(audioContext);
      audioReady=Promise.resolve();
      audioDestination=audioContext.createMediaStreamDestination();
      ripBus=audioContext.createGain();ripBus.gain.value=config().sfxVolume;

      const limiter=audioContext.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-3,audioContext.currentTime);
      limiter.knee.setValueAtTime(4,audioContext.currentTime);
      limiter.ratio.setValueAtTime(14,audioContext.currentTime);
      limiter.attack.setValueAtTime(0.001,audioContext.currentTime);
      limiter.release.setValueAtTime(0.04,audioContext.currentTime);

      ripBus.connect(limiter);
      limiter.connect(audioContext.destination);
      limiter.connect(audioDestination);
      ripOutput=limiter;

      const silence=audioContext.createConstantSource();silence.offset.value=0;silence.connect(audioDestination);silence.start();
      if(musicAudio)configureMusicSource();
    }
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }
  function updateRipMix(){
    if(!ripBus)return;
    ripBus.gain.value=config().sfxVolume;
  }
  function stopRip(){
    nextAvailableSnapTime=0;
    while(activeSnapVoices.length){
      const v=activeSnapVoices.pop();
      try{v.source.stop();v.source.disconnect();v.gain.disconnect();}catch(e){}
    }
  }
  function playSnap(options={},force=false){
    const cfg=config();if(!force&&(!cfg.threads||!cfg.ripSounds))return;
    if(!audioContext||audioContext.state!=='running'||!snapBuffers.length)return;

    const now=audioContext.currentTime;
    if(nextAvailableSnapTime<now){
      nextAvailableSnapTime=now;
    }

    let scheduleTime=nextAvailableSnapTime;

    // In a massive cluster cut, cap queue horizon so sounds NEVER lag behind the physics
    if(!force&&(scheduleTime-now>MAX_BURST_QUEUE_LATENCY)){
      if(activeSnapVoices.length>0){
        const lastVoice=activeSnapVoices[activeSnapVoices.length-1];
        if(lastVoice&&!lastVoice.ended){
          try{
            const curVal=lastVoice.gain.gain.value;
            lastVoice.gain.gain.setValueAtTime(curVal,now);
            lastVoice.gain.gain.linearRampToValueAtTime(Math.min(1.2,curVal*1.06),now+0.004);
          }catch(e){}
        }
      }
      return;
    }

    // Schedule next available slot with micro-spacing
    nextAvailableSnapTime=scheduleTime+SNAP_MICRO_SPACING;

    // Prune finished voices
    for(let i=activeSnapVoices.length-1;i>=0;i--){
      if(activeSnapVoices[i].ended||now>activeSnapVoices[i].endTime+0.01){
        activeSnapVoices.splice(i,1);
      }
    }

    // Voice stealing: ensure simultaneous voices never exceed limit
    while(activeSnapVoices.length>=MAX_CONCURRENT_SNAP_VOICES){
      const oldest=activeSnapVoices.shift();
      try{
        oldest.gain.gain.setValueAtTime(oldest.gain.gain.value,scheduleTime);
        oldest.gain.gain.linearRampToValueAtTime(0,scheduleTime+0.004);
        oldest.source.stop(scheduleTime+0.005);
      }catch(e){}
    }

    // Variation selection: deterministic variation based on strand ID + counter
    const varSeed=(options.k!==undefined?options.k+(options.ownerId||0)*11:snapVariationCounter++);
    const bufIndex=Math.abs(varSeed)%snapBuffers.length;
    const buffer=snapBuffers[bufIndex];

    const source=audioContext.createBufferSource();
    source.buffer=buffer;

    // Natural physical variations:
    // 1. Cut position along strand (near ball = slightly higher tension/pitch, near rim = slightly deeper twang)
    const cutPos=options.cutR!==undefined?options.cutR:0.5;
    const posPitchShift=1.0+(0.5-cutPos)*0.06;

    // 2. Ball cutting velocity (faster slice = subtly sharper transient & pitch)
    const cutSpeed=options.speed!==undefined?options.speed:300;
    const speedRatio=clamp(cutSpeed/300,0.75,1.4);
    const speedPitchShift=1.0+(speedRatio-1.0)*0.04;

    // 3. Subtle random detune (±2.5%)
    const microDetune=0.975+Math.random()*0.05;

    source.playbackRate.setValueAtTime(posPitchShift*speedPitchShift*microDetune,scheduleTime);

    // Dynamic voice gain management
    const polyphonyDamping=1.0/Math.sqrt(Math.max(1,activeSnapVoices.length+1));
    const speedVolume=0.90+(speedRatio-1.0)*0.15;
    const voiceVolume=clamp(speedVolume*polyphonyDamping,0.55,1.1);

    const voiceGain=audioContext.createGain();
    voiceGain.gain.setValueAtTime(voiceVolume,scheduleTime);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001,scheduleTime+0.095);

    source.connect(voiceGain);
    voiceGain.connect(ripBus);

    const voiceEntry={
      source,
      gain:voiceGain,
      startTime:scheduleTime,
      endTime:scheduleTime+0.095,
      ended:false
    };
    activeSnapVoices.push(voiceEntry);

    source.onended=()=>{
      voiceEntry.ended=true;
      try{
        source.disconnect();
        voiceGain.disconnect();
      }catch(e){}
      const idx=activeSnapVoices.indexOf(voiceEntry);
      if(idx>=0)activeSnapVoices.splice(idx,1);
    };

    source.start(scheduleTime);
  }
  function playRip(force=false){
    playSnap({},force);
  }
  window.audioEngine = {
    getBuffersCount: () => snapBuffers.length,
    getActiveVoicesCount: () => activeSnapVoices.length,
    playSnap,
    getAudioContext: () => audioContext
  };
  function configureMusicSource(){
    if(!audioContext||!musicAudio||musicSource)return;
    musicSource=audioContext.createMediaElementSource(musicAudio);
    musicGain=audioContext.createGain();musicGain.gain.value=config().musicVolume;
    musicSource.connect(musicGain);musicGain.connect(audioContext.destination);musicGain.connect(audioDestination);
  }
  function startMusic(){
    if(!musicAudio)return;
    ensureAudio();configureMusicSource();
    musicAudio.loop=true;musicAudio.volume=1;
    musicAudio.play().catch(()=>toast('Click Start again to enable music playback.'));
  }
  function segmentDistance(px,py,qx,qy,rx,ry,sx,sy){
    // Minimum distance between two finite line segments (ball motion and strand).
    const ux=qx-px,uy=qy-py,vx=sx-rx,vy=sy-ry,wx=px-rx,wy=py-ry;
    const a=ux*ux+uy*uy,b=ux*vx+uy*vy,c=vx*vx+vy*vy,d=ux*wx+uy*wy,e=vx*wx+vy*wy;
    const D=a*c-b*b, EPS=1e-10;
    let sn,sD=D,tn,tD=D;
    if(D<EPS){sn=0;sD=1;tn=e;tD=c;}
    else{
      sn=b*e-c*d;tn=a*e-b*d;
      if(sn<0){sn=0;tn=e;tD=c;}
      else if(sn>sD){sn=sD;tn=e+b;tD=c;}
    }
    if(tn<0){tn=0;if(-d<0)sn=0;else if(-d>a)sn=sD;else{sn=-d;sD=a;}}
    else if(tn>tD){tn=tD;if(-d+b<0)sn=0;else if(-d+b>a)sn=sD;else{sn=-d+b;sD=a;}}
    const sc=Math.abs(sn)<EPS?0:sn/sD,tc=Math.abs(tn)<EPS?0:tn/tD;
    return Math.hypot(wx+sc*ux-tc*vx,wy+sc*uy-tc*vy);
  }
  function snapThread(strand,x,y,position,cuttingBall){
    const owner=balls[strand.owner];
    if(finished||strand.cutAt>=0||!owner?.alive)return false;
    strand.cutAt=elapsed;strand.cutR=position;cutCount++;
    addParticles(x,y,owner.color,2,70);
    owner.hp=Math.max(0,owner.hp-1);owner.glow=1;
    const speed = cuttingBall ? Math.hypot(cuttingBall.vx, cuttingBall.vy) : 300;
    playSnap({ cutR: position, speed, ownerId: strand.owner, k: strand.k });
    if(owner.hp<=0)eliminate(owner);
    return true;
  }
  // Collision between moving balls and the fans belonging to *other* players.
  // Swept movement is checked against both the previous and current fiber
  // placement to reduce tunnelling, with a cap on simultaneous snap bursts.
  function cutEnemyThreads(active){
    if(!config().threads||!threads.length||active.length<2)return;
    const maxCutsPerBall=200;
    for(let bIdx=0;bIdx<active.length;bIdx++){
      const ball=active[bIdx];
      if(!ball.alive)continue;
      let cuts=0;
      const bMinX=Math.min(ball.prevX,ball.x)-ball.r;
      const bMaxX=Math.max(ball.prevX,ball.x)+ball.r;
      const bMinY=Math.min(ball.prevY,ball.y)-ball.r;
      const bMaxY=Math.max(ball.prevY,ball.y)+ball.r;

      for(let oIdx=0;oIdx<balls.length;oIdx++){
        if(oIdx===ball.id)continue;
        const owner=balls[oIdx];
        if(!owner||!owner.alive)continue;

        const sMinX=Math.min(owner.x-owner.r,owner.prevX-owner.r);
        const sMaxX=Math.max(owner.x+owner.r,owner.prevX+owner.r);
        const sMinY=Math.min(owner.y-owner.r,owner.prevY-owner.r);
        const sMaxY=Math.max(owner.y+owner.r,owner.prevY+owner.r);

        const oThreads=ballThreads[oIdx];
        if(!oThreads)continue;
        for(let sIdx=0;sIdx<oThreads.length;sIdx++){
          const strand=oThreads[sIdx];
          if(strand.cutAt>=0)continue;

          // Bounding box prune
          const strMinX=Math.min(strand.bx,sMinX);
          const strMaxX=Math.max(strand.bx,sMaxX);
          const strMinY=Math.min(strand.by,sMinY);
          const strMaxY=Math.max(strand.by,sMaxY);

          if(bMaxX<strMinX||bMinX>strMaxX||bMaxY<strMinY||bMinY>strMaxY)continue;

          // Inlined strand geometry current
          const obx=strand.bx,oby=strand.by;
          const ox=owner.x,oy=owner.y,or_=owner.r;
          const odx=obx-ox,ody=oby-oy;
          const olen=Math.hypot(odx,ody);
          if(olen<=or_+1)continue;
          const invOlen=1/olen;
          const oUnitX=odx*invOlen,oUnitY=ody*invOlen;
          const oax=ox+oUnitX*or_,oay=oy+oUnitY*or_;

          const distance=segmentDistance(ball.prevX,ball.prevY,ball.x,ball.y,oax,oay,obx,oby);

          // Past strand geometry
          const opx=owner.prevX,opy=owner.prevY;
          const opdx=obx-opx,opdy=oby-opy;
          const oplen=Math.hypot(opdx,opdy);
          let prevDistance=Infinity;
          if(oplen>or_+1){
            const invOplen=1/oplen;
            const opax=opx+opdx*invOplen*or_,opay=opy+opdy*invOplen*or_;
            prevDistance=segmentDistance(ball.prevX,ball.prevY,ball.x,ball.y,opax,opay,obx,oby);
          }

          if(Math.min(distance,prevDistance)>ball.r)continue;

          const gLen=olen-or_;
          const t=clamp(((ball.x-oax)*oUnitX+(ball.y-oay)*oUnitY)/gLen,.06,.94);
          const px=oax+(obx-oax)*t,py=oay+(oby-oay)*t;
          if(snapThread(strand,px,py,t,ball)){
            ball.glow=.7;
            ball.lastCut=elapsed;
            cuts++;
          }
          if(finished)return;
          if(cuts>=maxCutsPerBall)break;
        }
      }
    }
  }
  function addParticles(x,y,color,count=9,power=100){
    for(let i=0;i<count;i++){const a=rand(0,TAU),s=rand(power*.2,power);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.3,.92),color,size:rand(1,4.5)});}
    if(particles.length>230)particles.splice(0,particles.length-230);
  }
  function eliminate(ball){
    if(!ball||!ball.alive||alive().length<=1)return;
    ball.alive=false;ball.hp=0;ball.deathAt=elapsed;
    lastEliminationTime=elapsed;
    announcements.unshift({name:cleanLabel(ball.name),color:ball.color,time:elapsed});
    if(announcements.length>4)announcements.length=4;
    addParticles(ball.x,ball.y,ball.color,36,300);
    rings.push({x:ball.x,y:ball.y,t:0,color:ball.color});
    const remaining=alive();
    if(remaining.length===1)declareWinner(remaining[0]);else updateStats();
  }
  function declareWinner(ball,reason=''){
    if(winner)return;
    winner=ball;ball.winReason=reason;ball.hp=Math.max(ball.hp,1);finished=true;finishedAt=elapsed;
    if(musicAudio&&recording===false)musicAudio.pause();
    setRunning(false);
    for(let i=0;i<4;i++)addParticles(ball.x,ball.y,ball.color,25,420);
    updateStats();
    if(!recording)toast(`${cleanLabel(ball.name)} wins! Replay or record your own battle.`);
  }
  function step(dt){
    if(!simRunning){animateEffects(dt);return;}
    dt=clamp(dt,0,.05);
    const cfg=config();
    // True slow motion changes physics progression (not merely a visual label).
    const slow=cfg.slowmo==='all'||(cfg.slowmo==='on'&&alive().length<=2&&alive().length>1);
    const sdt=dt*(slow?.52:1);
    elapsed+=dt;

    const active=alive();
    const count=active.length;

    // Progressive speed system
    let phaseMultiplier=1.0;
    if(count>=6)phaseMultiplier=SPEED_MULTIPLIERS.phase1;
    else if(count>=4)phaseMultiplier=SPEED_MULTIPLIERS.phase2;
    else if(count===3)phaseMultiplier=SPEED_MULTIPLIERS.phase3;
    else if(count<=2)phaseMultiplier=SPEED_MULTIPLIERS.phase4;

    const timeSinceElim=elapsed-lastEliminationTime;
    let pacingBoost=0;
    if(timeSinceElim>INACTIVITY_THRESHOLD&&count>1){
      pacingBoost=Math.min(0.55,(timeSinceElim-INACTIVITY_THRESHOLD)*INACTIVITY_ACCELERATION);
    }

    const remainingTime=cfg.duration-elapsed;
    let deadlineBoost=0;
    if(remainingTime<=6){
      deadlineBoost=clamp((6-remainingTime)/6,0,1)*0.6;
    }

    const currentTargetSpeed=125*(phaseMultiplier+pacingBoost+deadlineBoost)*cfg.speed;

    steerDuel(active,sdt);
    // Bouncing-ball physics: independent motion, wall reflections and pairwise impulses.
    for(const b of active){
      b.prevX=b.x;b.prevY=b.y;
      b.rotation+=sdt*1.9;
      b.glow=Math.max(0,b.glow-dt*3);

      // Smooth growth animation
      if(b.r<b.targetR){
        b.r=Math.min(b.targetR,b.r+(b.targetR-b.baseRadius)*(sdt/GROWTH_ANIMATION_DURATION));
      }

      // Smooth speed adjustment towards phase target
      b.speedFloor+=(currentTargetSpeed-b.speedFloor)*Math.min(1,sdt*2.0);
      let speed=Math.hypot(b.vx,b.vy),min=b.speedFloor,max=Math.min(MAX_PARTICIPANT_SPEED*cfg.speed,Math.max(180*cfg.speed,min*1.35));
      if(speed>1e-6){
        if(speed>max){const s=max/speed;b.vx*=s;b.vy*=s;}
        else if(speed<min){const s=min/speed;b.vx*=s;b.vy*=s;}
      }else{b.vx=min;b.vy=0;}
      b.x+=b.vx*sdt;b.y+=b.vy*sdt;
      resolveWall(b);
      b.trail.push({x:b.x,y:b.y});if(b.trail.length>8)b.trail.shift();
    }
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      const a=active[i],b=active[j];if(!a.alive||!b.alive)continue;
      let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      const min=a.r+b.r+2,key=(Math.min(a.id,b.id)<<8)|Math.max(a.id,b.id);
      if(d>min+2){pairContacts.delete(key);continue;}
      if(d>=min)continue;
      if(d<.00001){dx=1;dy=0;d=1;}
      const nx=dx/d,ny=dy/d;
      const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      const newImpact=relative<0&&!pairContacts.has(key);
      pairContacts.add(key);
      if(relative<0){
        const speedA=Math.hypot(a.vx,a.vy),speedB=Math.hypot(b.vx,b.vy);
        const impulse=-1.95*relative/2;
        a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
        if(newImpact){
          const growth=active.length===2?DUEL_GROWTH_FACTOR:COLLISION_GROWTH_FACTOR;
          growBall(a,growth);growBall(b,growth);
          // Normal collisions throughout; extra acceleration starts in the final three.
          if(active.length>=2&&active.length<=FINAL_ACCELERATION_COUNT){
            const acceleration=active.length===2?DUEL_SPEED_FACTOR:COLLISION_SPEED_FACTOR;
            boostBall(a,speedA,cfg,acceleration);boostBall(b,speedB,cfg,acceleration);
          }
          a.glow=.8;b.glow=.8;
          if(elapsed-lastCollisionTime>.055){addParticles((a.x+b.x)/2,(a.y+b.y)/2,'#e9faff',7,160);lastCollisionTime=elapsed;}
        }
      }
      const overlap=(a.r+b.r+2-d)/2;
      if(overlap>0){a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;}
      if(newImpact&&active.length===2){
        a.duelSteerAfter=b.duelSteerAfter=duelClock+DUEL_SEPARATION_TIME;
        const x=a.x+nx*(a.r+1),y=a.y+ny*(a.r+1);
        const pulse=Math.max(40,Math.min(250,Math.max(a.r,b.r)*2.05));
        rings.push({x,y,t:0,color:'#fff4b0',maxRadius:pulse});
      }
    }
    // Iterative position relaxation: completely prevent overlapping and arena escape
    for(let iter=0;iter<3;iter++){
      let anyOverlap=false;
      for(let i=0;i<active.length;i++){
        const ball=active[i];if(!ball.alive)continue;
        const dx=ball.x-CENTER.x,dy=ball.y-CENTER.y,dist=Math.hypot(dx,dy)||1;
        const boundary=CENTER.r-ball.r-3;
        if(dist>boundary){ball.x=CENTER.x+(dx/dist)*boundary;ball.y=CENTER.y+(dy/dist)*boundary;}
      }
      for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
        const a=active[i],b=active[j];if(!a.alive||!b.alive)continue;
        let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
        const min=a.r+b.r+2;
        if(d<min){
          anyOverlap=true;
          if(d<.00001){dx=1;dy=0;d=1;}
          const nx=dx/d,ny=dy/d,overlap=(min-d)/2;
          a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
        }
      }
      if(!anyOverlap)break;
    }
    for(let i=0;i<active.length;i++){
      const ball=active[i];if(!ball.alive)continue;
      const dx=ball.x-CENTER.x,dy=ball.y-CENTER.y,dist=Math.hypot(dx,dy)||1;
      const boundary=CENTER.r-ball.r-3;
      if(dist>boundary){ball.x=CENTER.x+(dx/dist)*boundary;ball.y=CENTER.y+(dy/dist)*boundary;}
    }

    // Strands belong to individual contestants and are cut by other balls.
    cutEnemyThreads(active);
    for(const b of active)if(b.alive&&b.hp<=0)eliminate(b);
    // No invisible, random, timed eliminations. Only a snapped-fiber HP loss
    // can eliminate a player. At the time limit a visible HP tiebreak is optional.
    if(elapsed>=cfg.duration&&!finished&&alive().length<=1){
      if(alive().length===1)declareWinner(alive()[0]);
      else if(cfg.guarantee){
        const top=alive().slice().sort((a,b)=>b.hp-a.hp);
        declareWinner(top[0],'HP TIEBREAK');
      }else{
        finished=true;finishedAt=elapsed;setRunning(false);updateStats();
        if(!recording)toast('Time up: no forced eliminations. Increase duration or enable HP tiebreak.');
      }
    }
    animateEffects(dt);
    if(Math.floor(elapsed*5)!==mark){mark=Math.floor(elapsed*5);updateStats();}
  }
  function animateEffects(dt){
    particles=particles.filter(p=>p.t<p.life);rings=rings.filter(r=>r.t<.6);
    for(const p of particles){p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.99;p.vy*=.99;p.vy+=35*dt;}
    for(const r of rings)r.t+=dt;
  }
  function rrect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function text(x,y,label,size,color='#fff',weight=700,align='center',spacing=0){
    ctx.save();ctx.font=`${weight} ${size}px Inter,Arial,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';
    if(spacing){const chars=[...label];const widths=chars.map(c=>ctx.measureText(c).width);const total=widths.reduce((a,b)=>a+b,0)+spacing*(chars.length-1);let pos=x-(align==='center'?total/2:0);for(let i=0;i<chars.length;i++){ctx.fillText(chars[i],pos,y);pos+=widths[i]+spacing;}}
    else ctx.fillText(label,x,y);
    ctx.restore();
  }
  function initBgCanvas(){
    if(!bgCanvas){
      bgCanvas=document.createElement('canvas');
      bgCanvas.width=VW;bgCanvas.height=VH;
    }
    const bctx=bgCanvas.getContext('2d');
    bctx.fillStyle='#000207';bctx.fillRect(0,0,VW,VH);
    const g=bctx.createRadialGradient(CENTER.x,CENTER.y,80,CENTER.x,CENTER.y,540);
    g.addColorStop(0,'#0b1728');g.addColorStop(.65,'#030c15');g.addColorStop(1,'#000207');
    bctx.fillStyle=g;bctx.fillRect(0,0,VW,VH);
  }
  function drawBackground(t){
    if(!bgCanvas)initBgCanvas();
    ctx.drawImage(bgCanvas,0,0);
  }
  function drawArena(t){
    ctx.save();ctx.beginPath();ctx.arc(CENTER.x,CENTER.y,CENTER.r,0,TAU);ctx.strokeStyle='#f6fbff';ctx.lineWidth=3;ctx.shadowColor='#a5d7ed';ctx.shadowBlur=5;ctx.stroke();ctx.restore();
  }
  function drawThreads(alpha=1){
    if(!config().threads)return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(CENTER.x,CENTER.y,CENTER.r+3,0,TAU);
    ctx.clip();
    for(let bIdx=0;bIdx<balls.length;bIdx++){
      const b=balls[bIdx];
      if(!b.alive)continue;
      const bThreads=ballThreads[bIdx];
      if(!bThreads||!bThreads.length)continue;
      const rx=(b.renderPrevX!==undefined&&simRunning)?b.renderPrevX+(b.x-b.renderPrevX)*alpha:b.x;
      const ry=(b.renderPrevY!==undefined&&simRunning)?b.renderPrevY+(b.y-b.renderPrevY)*alpha:b.y;
      const br=b.r;

      ctx.strokeStyle=b.color;
      ctx.globalAlpha=.68;
      ctx.lineWidth=.85;
      ctx.beginPath();
      for(let sIdx=0;sIdx<bThreads.length;sIdx++){
        const strand=bThreads[sIdx];
        if(strand.cutAt>=0)continue;
        const bx=strand.bx,by=strand.by;
        const ddx=bx-rx,ddy=by-ry;
        const len=Math.hypot(ddx,ddy);
        if(len<=br)continue;
        const inv=1/len;
        ctx.moveTo(rx+ddx*inv*br,ry+ddy*inv*br);
        ctx.lineTo(bx,by);
      }
      ctx.stroke();

      ctx.fillStyle=b.color;
      ctx.globalAlpha=.95;
      ctx.beginPath();
      for(let sIdx=0;sIdx<bThreads.length;sIdx++){
        const strand=bThreads[sIdx];
        if(strand.cutAt>=0)continue;
        const bx=strand.bx,by=strand.by;
        ctx.moveTo(bx+1.65,by);
        ctx.arc(bx,by,1.65,0,TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  }
  function updateBallFace(b){
    const r=b.r, d=Math.ceil(r*2);
    if(!b.faceCanvas) b.faceCanvas=document.createElement('canvas');
    b.faceCanvas.width=d;b.faceCanvas.height=d;
    const fc=b.faceCanvas.getContext('2d');
    fc.clearRect(0,0,d,d);
    fc.save();
    fc.beginPath();fc.arc(r,r,r,0,TAU);fc.clip();
    const pic=getImage(b.src);
    if(pic){
      const scale=Math.max(d/pic.width,d/pic.height),w=pic.width*scale,h=pic.height*scale;
      fc.drawImage(pic,r-w/2,r-h/2,w,h);
    }else{
      const gradient=fc.createLinearGradient(0,0,d,d);
      gradient.addColorStop(0,'#d7e7fa');gradient.addColorStop(1,'#314a68');
      fc.fillStyle=gradient;fc.fillRect(0,0,d,d);
      const label=avatarText(b.name);
      const fontSize = Math.round(r * (label.length > 2 ? 0.54 : 0.60));
      fc.font=`900 ${fontSize}px Inter,Arial,sans-serif`;
      fc.fillStyle='#071529';fc.textAlign='center';fc.textBaseline='middle';
      fc.fillText(label,r,r-1);
    }
    const sheen=fc.createLinearGradient(0,0,d,d);
    sheen.addColorStop(0,'#ffffff47');sheen.addColorStop(.46,'#ffffff00');sheen.addColorStop(1,'#00000022');
    fc.fillStyle=sheen;fc.fillRect(0,0,d,d);
    fc.restore();
    b.faceRadius=r;b.faceName=b.name;b.faceSrc=b.src;
  }
  function drawBall(b,rx=b.x,ry=b.y){
    const r=b.r;
    ctx.save();
    ctx.shadowBlur=25+b.glow*16;ctx.shadowColor=b.color;
    ctx.fillStyle='#08131c';ctx.beginPath();ctx.arc(rx,ry,r+5,0,TAU);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(rx,ry,r+4,0,TAU);ctx.fill();
    ctx.restore();

    if(!b.faceCanvas||Math.abs(b.faceRadius-r)>0.5||b.faceName!==b.name||b.faceSrc!==b.src)updateBallFace(b);
    ctx.drawImage(b.faceCanvas,rx-r,ry-r);

    ctx.beginPath();ctx.arc(rx,ry,r+4,0,TAU);ctx.strokeStyle=b.color;ctx.lineWidth=2;ctx.stroke();
    ctx.shadowBlur=8;ctx.shadowColor='#000';text(rx,ry+r+22,String(Math.ceil(b.hp)),18,'#fff',900);ctx.shadowBlur=0;
  }
  function drawParticles(){
    if(particles.length){
      ctx.shadowBlur=9;
      let lastColor='';
      for(const p of particles){
        ctx.globalAlpha=clamp(1-p.t/p.life,0,1);
        if(p.color!==lastColor){
          ctx.fillStyle=p.color;
          ctx.shadowColor=p.color;
          lastColor=p.color;
        }
        ctx.beginPath();
        ctx.arc(p.x,p.y,Math.max(0,p.size*(1-p.t/p.life)),0,TAU);
        ctx.fill();
      }
      ctx.shadowBlur=0;
      ctx.globalAlpha=1;
    }
    for(const r of rings){
      ctx.save();
      if(r.maxRadius){ctx.beginPath();ctx.arc(CENTER.x,CENTER.y,CENTER.r-2,0,TAU);ctx.clip();}
      ctx.beginPath();ctx.arc(r.x,r.y,r.maxRadius?r.maxRadius*Math.min(1,r.t/.22):r.t*155,0,TAU);
      ctx.strokeStyle=r.color;ctx.globalAlpha=1-r.t/.6;ctx.lineWidth=6*(1-r.t/.6);ctx.stroke();ctx.restore();
    }
    ctx.globalAlpha=1;
  }
  function drawHeader(t){
    const title=config().title.toUpperCase();
    const size=title.length>24?36:title.length>17?41:45;
    ctx.save();ctx.shadowColor='#030509';ctx.shadowBlur=13;text(VW/2,214,title,Math.min(size,36),'#fff',900);ctx.restore();
    const eliminated=balls.filter(b=>!b.alive);
    const icons=Math.min(eliminated.length,8), start=VW/2-(icons*28+100)/2;
    eliminated.slice(0,8).forEach((b,i)=>{
      const x=start+15+i*28,y=247,r=12;
      ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();ctx.fillStyle=b.color;ctx.fill();
      const pic=getImage(b.src);if(pic){ctx.drawImage(pic,x-r,y-r,r*2,r*2);}else{text(x,y,avatarText(b.name),11,'#021020',900);}
      ctx.restore();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.strokeStyle='#ffffffaa';ctx.lineWidth=1;ctx.stroke();
    });
    text(start+icons*28+53,247,`${alive().length} LEFT`,18,alive().length<=2?'#fd839c':'#e8edf6',900);
  }
  function drawAnnouncements(){
    if(winner)return;const e=announcements.find(a=>elapsed-a.time<1.2);
    if(e){ctx.fillStyle='#020810';ctx.fillRect(140,231,440,29);text(360,247,e.name.toUpperCase()+' OUT',27,e.color,900);}
  }
  function drawFooter(){
    if(config().cta&&elapsed>4){ctx.save();ctx.fillStyle='#c42527';rrect(50,898,175,32,16);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();text(137,914,'✚ FOLLOW FOR MORE',13,'#fff',900);ctx.restore();}
  }
  function drawWin(){
    const b=winner;if(!b)return;
    const dur=Math.max(0,elapsed-finishedAt);
    const alpha=clamp(dur*3,0,1);
    ctx.save();ctx.globalAlpha=alpha;
    ctx.fillStyle='#040b17cc';rrect(55,464,610,355,36);ctx.fill();
    ctx.strokeStyle=b.color;ctx.lineWidth=2;rrect(55,464,610,355,36);ctx.stroke();
    ctx.shadowColor=b.color;ctx.shadowBlur=40;ctx.beginPath();ctx.arc(360,568,71,0,TAU);ctx.fillStyle=b.color;ctx.fill();ctx.shadowBlur=0;
    // Central portrait by reusing the contender renderer with a single static circle.
    const origR=b.r;b.r=65;
    const previousTrail=b.trail;b.trail=[];drawBall(b,360,568);b.trail=previousTrail;
    b.r=origR;
    text(360,681,'WINNER!',49,'#ffffff',900);
    text(360,733,cleanLabel(b.name).toUpperCase(),33,b.color,900);
    text(360,781,b.winReason||'THE LAST BALL STANDING',14,'#a9c3d8',800,'center',2);
    ctx.restore();
  }
  function draw(alpha=1){
    if(!ctx)return;
    const k=canvas.width/VW;ctx.setTransform(k,0,0,k,0,0);
    drawBackground(elapsed);
    drawHeader(elapsed);
    drawArena(elapsed);
    drawThreads(alpha);
    drawParticles();
    const sorted=balls.filter(b=>b.alive).slice().sort((a,b)=>{
      const ay=(a.renderPrevY!==undefined&&simRunning)?a.renderPrevY+(a.y-a.renderPrevY)*alpha:a.y;
      const by=(b.renderPrevY!==undefined&&simRunning)?b.renderPrevY+(b.y-b.renderPrevY)*alpha:b.y;
      return ay-by;
    });
    sorted.forEach(b=>{
      const rx=(b.renderPrevX!==undefined&&simRunning)?b.renderPrevX+(b.x-b.renderPrevX)*alpha:b.x;
      const ry=(b.renderPrevY!==undefined&&simRunning)?b.renderPrevY+(b.y-b.renderPrevY)*alpha:b.y;
      drawBall(b,rx,ry);
    });
    drawAnnouncements();
    drawFooter();
    if(winner){/* Keep the surviving ball visible without a winner overlay. */}
    else if(finished){ctx.save();ctx.fillStyle='#0a122adf';rrect(90,465,540,250,26);ctx.fill();text(360,556,"TIME'S UP",43,'#f8fbff',900);text(360,620,'NO FORCED ELIMINATIONS',22,'#b1d7ef',800);ctx.restore();}
  }
  function frame(stamp){
    if(!lastStamp) lastStamp = stamp;
    let dt = (stamp - lastStamp) / 1000;
    lastStamp = stamp;
    if(dt > 0.1) dt = 0.1;

    if(simRunning){
      accumulator += dt;
      if(accumulator > 0.15) accumulator = 0.15;
      while(accumulator >= FIXED_DT && simRunning){
        for(let i=0; i<balls.length; i++){
          const b = balls[i];
          b.renderPrevX = b.x;
          b.renderPrevY = b.y;
        }
        step(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    } else {
      accumulator = 0;
      step(dt);
    }

    if(finished){
      elapsed += dt;
      animateEffects(dt);
    }

    const alpha = simRunning ? clamp(accumulator / FIXED_DT, 0, 1) : 1;
    draw(alpha);

    if(recording && finished && elapsed >= finishedAt + 2.4) stopRecording();
    raf = requestAnimationFrame(frame);
  }
  function setCanvasResolution(n){
    canvas.width=n;canvas.height=Math.round(n*16/9);
    $('previewResolution').textContent=`${canvas.width} × ${canvas.height}`;
    draw(1);
  }
  function streamMime(){
    if(!('MediaRecorder' in window))return '';
    const opts=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    return opts.find(x=>MediaRecorder.isTypeSupported(x))||'';
  }
  async function startRecording(){
    if(recording)return;
    if(!canvas.captureStream||!window.MediaRecorder){toast('Recording is not available here. Open in Chrome or Edge on laptop.');return;}
    const mime=streamMime();if(!mime){toast('This browser does not support WebM recording. Use Chrome or Edge.');return;}
    try{
      ensureAudio();
      await audioReady;
      if(audioContext?.state==='suspended')await audioContext.resume();
      setCanvasResolution(config().quality);
      const stream=canvas.captureStream(60);
      // The destination carries both SFX and optional licensed music.
      if(audioDestination){audioDestination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}
      chunks=[];
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:config().quality===1080?12000000:7000000,audioBitsPerSecond:128000});
      recorder.ondataavailable=e=>{if(e.data?.size>0)chunks.push(e.data)};
      recorder.onstop=()=>{
        try{
          if(chunks.length){
            const blob=new Blob(chunks,{type:'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');
            a.href=url;a.download=`BallBattlee_${new Date().toISOString().slice(0,10)}_${Math.floor(Date.now()/1000)}.webm`;document.body.append(a);a.click();a.remove();
            setTimeout(()=>URL.revokeObjectURL(url),60000);
            toast(`Video downloaded (${(blob.size/1048576).toFixed(1)} MB). Add it to CapCut or convert to MP4 if needed.`);
          }else toast('No recording data was produced. Try Chrome or Edge.');
        } finally {
          stream.getTracks().forEach(t=>t.stop());
          chunks=[];setCanvasResolution(720);
        }
      };
      recorder.onerror=e=>{console.error('Recorder error',e);toast('Recording error. Try 720p or a different browser.');};
      recorder.start(1000);recording=true;
      $('recordBtn').hidden=true;$('stopBtn').hidden=false;$('recordingOverlay').hidden=false;
      $('quality').disabled=true;$('duration').disabled=true;$('count').disabled=true;
      reset(true);
      toast('Recording started. Keep this tab visible until the battle finishes.');
    }catch(e){console.error(e);recording=false;setCanvasResolution(720);toast(`Recording could not start: ${e.message||'unknown browser issue'}`);}
  }
  function stopRecording(){
    if(!recording)return;
    recording=false;$('recordBtn').hidden=false;$('stopBtn').hidden=true;$('recordingOverlay').hidden=true;
    $('quality').disabled=false;$('duration').disabled=false;$('count').disabled=false;
    setRunning(false);updateStats();
    if(musicAudio)musicAudio.pause();
    if(recorder?.state==='recording')recorder.stop();
  }
  function saveProject(){
    const cfg=config();
    const data={version:20,settings:cfg,slots};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='BallBattlee_Project.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);toast('Project settings saved as JSON.');
  }
  async function loadProject(file){
    if(!file)return;
    try{
      const data=JSON.parse(await file.text());
      if(!Array.isArray(data.slots)||!data.slots.length||data.slots.length>12)throw new Error('Invalid player list');
      const s=data.settings||{};
      const set=(id,v)=>{if(v!==undefined&&v!==null){const el=$(id);el.value=String(v)}};
      set('headline',s.title);set('duration',s.duration);set('speed',s.speed);set('theme',s.theme);set('quality',s.quality);if([35,55,75,110].includes(Number(s.density)))set('density',s.density);
      if([1,2,3].includes(Number(s.cutDamage)))set('cutDamage',s.cutDamage);
      if(['on','off','all'].includes(s.slowmo))set('slowmo',s.slowmo);
      if(Number.isFinite(s.sfxVolume))$('sfxVolume').value=String(Math.round(clamp(s.sfxVolume*100,0,100)));
      if(Number.isFinite(s.musicVolume))$('musicVolume').value=String(Math.round(clamp(s.musicVolume*100,0,100)));
      syncSliderLabels();
      for(const id of ['guarantee','threads','ripSounds','cta'])if(typeof s[id]==='boolean')$(id).checked=s[id];
      slots=data.slots.map((item,i)=>({name:String(item.name||`PLAYER ${i+1}`).slice(0,20),color: /^#[0-9a-fA-F]{6}$/.test(item.color)?item.color:colors[i],src:typeof item.src==='string'&&item.src.startsWith('data:image/')?item.src:null}));
      if(![4,6,8,10,12].includes(slots.length))throw new Error('This project needs 4, 6, 8, 10 or 12 players');
      $('count').value=slots.length;imageCache.clear();
      slots.forEach((s, idx)=>{ getImage(s.src); cachedSlotsPool[idx]=s; });
      makePlayerUI();reset();toast('Project loaded successfully.');
      scheduleAutoSave(true);
    }catch(e){toast('Could not load project: '+e.message)}
  }
  // Controls and lifecycle.
  async function togglePlayback(){
    if(recording){toast('Recording in progress.');return;}
    ensureAudio();await audioReady;
    if(audioContext?.state==='suspended')await audioContext.resume();
    if(finished)reset(true);
    else{setRunning(!simRunning);if(simRunning)startMusic();else{stopRip();if(musicAudio)musicAudio.pause();}}
  }
  $('playBtn').addEventListener('click',togglePlayback);
  $('resetBtn').addEventListener('click',()=>reset());
  $('recordBtn').addEventListener('click',startRecording);
  $('stopBtn').addEventListener('click',stopRecording);
  $('count').addEventListener('change',()=>{if(recording)return;resizeSlots(Number($('count').value))});
  $('shufflePlayers').addEventListener('click',()=>{
    if(recording)return;
    for(let i=slots.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]]}
    slots.forEach((s, idx)=>{ cachedSlotsPool[idx]=s; });
    makePlayerUI();reset();
    scheduleAutoSave(true);
  });
  $('headline').addEventListener('input',()=>scheduleAutoSave());
  for(const id of ['headline','theme','duration','speed','guarantee','cta','threads','density','cutDamage','slowmo','quality']){
    $(id).addEventListener('change',()=>{
      if(!recording&&id!=='quality')reset();
      scheduleAutoSave();
    });
  }
  $('saveProject').addEventListener('click',saveProject);
  $('loadProject').addEventListener('click',()=>$('projectFile').click());
  $('projectFile').addEventListener('change',e=>{loadProject(e.target.files?.[0]);e.target.value=''});
  document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)){
      e.preventDefault();if(!recording)togglePlayback();
    }
  });
  window.addEventListener('beforeunload',e=>{
    if(recording){e.preventDefault();e.returnValue='';}
    doSaveSync();
  });
  function syncSliderLabels(){
    $('sfxVolumeReadout').textContent=$('sfxVolume').value+'%';
    $('musicVolumeReadout').textContent=$('musicVolume').value+'%';
    if(musicGain)musicGain.gain.value=config().musicVolume;
    updateRipMix();
  }
  $('sfxVolume').addEventListener('input',()=>{syncSliderLabels();scheduleAutoSave();});
  $('musicVolume').addEventListener('input',()=>{syncSliderLabels();scheduleAutoSave();});
  $('testRip').addEventListener('click',async()=>{
    ensureAudio();await audioReady;if(audioContext?.state==='suspended')await audioContext.resume().catch(()=>{});
    playRip(true);
  });
  $('musicFile').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('audio/'))return toast('Choose an audio file.');
    if(file.size>40*1024*1024)return toast('Choose a music file under 40 MB.');
    if(musicAudio)musicAudio.pause();
    if(musicObjectUrl)URL.revokeObjectURL(musicObjectUrl);
    musicObjectUrl=URL.createObjectURL(file);
    if(!musicAudio){musicAudio=new Audio();musicAudio.loop=true;}
    musicAudio.src=musicObjectUrl;musicAudio.load();
    if(audioContext)configureMusicSource();
    $('musicStatus').textContent='Loaded: '+file.name;
    toast('Music imported locally. It will play when you start a battle.');

    try {
      await idbSet('custom_music', {
        name: file.name,
        type: file.type,
        blob: file,
        lastModified: file.lastModified
      });
      scheduleAutoSave(true);
    } catch(err) {
      console.warn('Could not persist music file to IndexedDB:', err);
    }
  });

  function restoreConfiguration(){
    let saved=null;
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw) saved=JSON.parse(raw);
    } catch(e) {
      console.warn('Failed to parse saved config from localStorage:', e);
    }

    if(saved && typeof saved === 'object'){
      const s=saved.settings||{};
      const set=(id,v)=>{if(v!==undefined&&v!==null&&$(id))$(id).value=String(v);};
      if(typeof s.title==='string')$('headline').value=s.title.slice(0,35);
      if([20,30,40,50,60].includes(Number(s.duration)))set('duration',s.duration);
      if([0.75,1,1.4,1.85].includes(Number(s.speed)))set('speed',s.speed);
      if([4,6,8,10,12].includes(Number(s.count)))set('count',s.count);
      if(['neon','sunset','arctic'].includes(s.theme))set('theme',s.theme);
      if([720,1080].includes(Number(s.quality)))set('quality',s.quality);
      if([35,55,75,110].includes(Number(s.density)))set('density',s.density);
      if([1,2,3].includes(Number(s.cutDamage)))set('cutDamage',s.cutDamage);
      if(['on','off','all'].includes(s.slowmo))set('slowmo',s.slowmo);
      if(Number.isFinite(Number(s.sfxVolume)))$('sfxVolume').value=String(clamp(Math.round(Number(s.sfxVolume)),0,100));
      if(Number.isFinite(Number(s.musicVolume)))$('musicVolume').value=String(clamp(Math.round(Number(s.musicVolume)),0,100));
      for(const id of ['guarantee','threads','ripSounds','cta']){
        if(typeof s[id]==='boolean'&&$(id))$(id).checked=s[id];
      }

      const count=Number($('count').value)||8;
      const defaults=defaultSlots(count);
      const rawSlots=Array.isArray(saved.slots)?saved.slots:[];

      cachedSlotsPool=defaults.map((def,i)=>{
        const item=rawSlots[i];
        if(!item)return def;
        return {
          name: typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,20):def.name,
          color: /^#[0-9a-fA-F]{6}$/.test(item.color)?item.color:def.color,
          src: null,
          hasImage: Boolean(item.hasImage)
        };
      });
      for(let i=count;i<Math.min(rawSlots.length,12);i++){
        const item=rawSlots[i];
        if(item){
          cachedSlotsPool[i]={
            name: typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,20):`PLAYER ${i+1}`,
            color: /^#[0-9a-fA-F]{6}$/.test(item.color)?item.color:colors[i%colors.length],
            src: null,
            hasImage: Boolean(item.hasImage)
          };
        }
      }
      slots=cachedSlotsPool.slice(0,count);
    } else {
      slots=defaultSlots(8);
      cachedSlotsPool=[...slots];
    }

    makePlayerUI();
    syncSliderLabels();
    reset(false);

    restoreIndexedDBAssets();
  }

  async function restoreIndexedDBAssets(){
    try {
      const savedImages=await idbGet('player_images');
      if(Array.isArray(savedImages)&&savedImages.length){
        let changed=false;
        savedImages.forEach((src,i)=>{
          if(src&&typeof src==='string'&&src.startsWith('data:image/')){
            if(cachedSlotsPool[i])cachedSlotsPool[i].src=src;
            if(slots[i]){
              slots[i].src=src;
              getImage(src);
              changed=true;
            }
          }
        });
        if(changed){
          makePlayerUI();
          balls.forEach(b=>{
            const slot=slots[b.id];
            if(slot&&slot.src){
              b.src=slot.src;
              b.faceSrc=null;
            }
          });
          draw(1);
        }
      }
    } catch(e) {
      console.warn('Could not restore images from IndexedDB:', e);
    }

    try {
      const musicAsset=await idbGet('custom_music');
      if(musicAsset&&musicAsset.blob){
        if(musicAudio)musicAudio.pause();
        if(musicObjectUrl)URL.revokeObjectURL(musicObjectUrl);
        musicObjectUrl=URL.createObjectURL(musicAsset.blob);
        if(!musicAudio){musicAudio=new Audio();musicAudio.loop=true;}
        musicAudio.src=musicObjectUrl;
        musicAudio.load();
        if(audioContext)configureMusicSource();
        $('musicStatus').textContent='Loaded: '+(musicAsset.name||'custom music');
      }
    } catch(e) {
      console.warn('Could not restore audio from IndexedDB:', e);
    }
  }

  restoreConfiguration();
  raf=requestAnimationFrame(frame);
})();
