/* BallBattlee Studio v16 — one sound per physical strand cut. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('battleCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: false });
  const TAU = Math.PI * 2, VW = 720, VH = 1280;
  const CENTER = { x: 360, y: 596, r: 330 };
  const WALL_GROWTH_FACTOR = 1.10;
  const WALL_STRING_BONUS = 11;
  const IMPACT_THREAD_SPREAD = .22;
  const FINAL_ACCELERATION_COUNT = 3;
  const COLLISION_GROWTH_FACTOR = 1.05;
  const COLLISION_SPEED_FACTOR = 1.08;
  const MAX_SPEED = 600;
  const DUEL_GROWTH_FACTOR = 1.12;
  const DUEL_SPEED_FACTOR = 1.12;
  const DUEL_SEPARATION_TIME = .18;
  const pairContacts = new Set();
  const colors = ['#f8c242','#e66c5b','#9a72ec','#42bafa','#25bd93','#f0f4fc','#ff9468','#27d1d0','#ff5ca8','#a9ca45','#ba92f5','#ffb950'];
  const stars = Array.from({length:130}, (_,i)=>({x:fract(Math.sin(i * 127.1) * 58372.1)*VW, y:fract(Math.sin(i * 62.7) * 32292.9)*VH, a: .10 + fract(Math.sin(i * 91.3) * 131.7)*.22,r: i%6===0?1.25:.55}));
  function fract(n){return n-Math.floor(n)}
  let slots = [];
  let imageCache = new Map();
  let balls = [], particles=[], rings=[], threads=[], announcements=[];
  let cutCount=0, stringsGained=0, musicAudio=null, musicSource=null, musicGain=null, musicObjectUrl=null;
  let elapsed = 0, simRunning=false, finished=false, winner=null, raf=0, lastStamp=0;
  let recorder=null, chunks=[], recording=false, finishedAt=-1;
  let audioContext=null, audioDestination=null, toastTimeout;
  let snapBuffers=[],ripBus=null,ripOutput=null,audioReady=Promise.resolve();
  const activeRipSources=new Set();
  let lastCollisionTime=0, duelClock=0, mark=0;
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
    slots=defaults.map((slot,i)=>slots[i]||slot);
    makePlayerUI();reset();
  }
  function getImage(src){
    if(!src)return null;
    if(!imageCache.has(src)){
      const img=new Image();
      img.onload=()=>draw();
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
        try {slot.src=await resizeImage(file);getImage(slot.src);makePlayerUI();reset();toast(`${slot.name}: picture added.`);}
        catch(e){console.error(e);toast('Could not load this image.');}
      });
      let info=document.createElement('div');info.className='player-cell';
      const number=document.createElement('div');number.className='playnum';number.textContent=`BALL ${String(i+1).padStart(2,'0')}`;
      const input=document.createElement('input');input.setAttribute('aria-label',`Ball ${i+1} name`);input.maxLength=20;input.value=slot.name;
      input.addEventListener('input',()=>{slot.name=input.value||'PLAYER';let b=balls[i];if(b)b.name=slot.name;});
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
    const angle=-1.84+(i+.5)*TAU/total, radius=CENTER.r-52;
    const x=slot.x??CENTER.x+Math.cos(angle)*radius,y=slot.y??CENTER.y+Math.sin(angle)*radius;
    const direction=Math.atan2(CENTER.y-y,CENTER.x-x)+rand(-.32,.32),speed=125*config().speed;
    return {name:slot.name,color:slot.color,src:slot.src,x,y,prevX:x,prevY:y,vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,hp:config().density,alive:true,r:40,wallContact:false,duelSteerAfter:0,speedFloor:speed,nextThreadIndex:config().density,glow:0,trail:[],id:i,rotation:0,deathAt:null,lastCut:-10};
  }
  function setRunning(run){simRunning=run;$('playText').textContent=run?'Pause simulation':finished?'Replay simulation':'Start simulation';$('playIcon').textContent=run?'Ⅱ':'▶';}
  // Each fiber joins its moving owner to a fixed point on the arena rim.
  function createThreads(){
    const density=config().density;
    threads=slots.flatMap((slot,owner)=>Array.from({length:density},(_,k)=>({owner,k,density,angle:-1.84+owner*TAU/slots.length+k*TAU/slots.length/density,cutAt:-1,cutR:0})));
  }
  function addThreads(ball,count,impactAngle){
    if(!config().threads||!ball.alive)return 0;
    const owned=threads.filter(s=>s.owner===ball.id);
    const broken=owned.filter(s=>s.cutAt>=0);
    const live=owned.filter(s=>s.cutAt<0).sort((a,b)=>(a.generation??a.k)-(b.generation??b.k));
    let born=0;
    // Refill missing fibers first. At capacity, move the oldest living fibers
    // to the new hit instead of accumulating unlimited HP and geometry.
    for(let i=0;i<count;i++){
      const strand=broken.shift()||live.shift();if(!strand)break;
      if(strand.cutAt>=0)ball.hp++;
      strand.angle=impactAngle+(count>1?i/(count-1)-.5:0)*IMPACT_THREAD_SPREAD;
      strand.generation=ball.nextThreadIndex++;strand.cutAt=-1;strand.cutR=0;born++;
    }
    stringsGained+=born;
    return born;
  }
  function growBall(ball,factor){
    // Both rim and ball collision growth unlock only for the final two contestants.
    if(alive().length!==2)return;
    // Leave room for the other live balls; reaching the limit never shrinks a ball.
    const maxRadius=Math.min(120,CENTER.r*Math.sqrt(.45/Math.max(1,alive().length)));
    ball.r=Math.max(ball.r,Math.min(ball.r*factor,maxRadius));
  }
  function boostBall(ball,beforeSpeed,cfg,factor=COLLISION_SPEED_FACTOR){
    const current=Math.hypot(ball.vx,ball.vy);
    ball.speedFloor=Math.min(MAX_SPEED*cfg.speed,Math.max(ball.speedFloor,beforeSpeed,current)*factor);
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
    for(const strand of threads){
      if(strand.owner!==opponent.id||strand.cutAt>=0)continue;
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
      const strand=threads.find(s=>s.owner===opponent.id&&s.cutAt<0);
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
    const key=`${Math.min(active[0].id,active[1].id)}:${Math.max(active[0].id,active[1].id)}`;
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
    if(dist<boundary-2)ball.wallContact=false;
    if(dist<=boundary)return;
    const nx=dx/dist,ny=dy/dist,vdot=ball.vx*nx+ball.vy*ny;
    if(vdot>0){
      if(!ball.wallContact){
        growBall(ball,WALL_GROWTH_FACTOR);addThreads(ball,WALL_STRING_BONUS,Math.atan2(ny,nx));
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
    const bx=CENTER.x+Math.cos(strand.angle)*(CENTER.r-1),by=CENTER.y+Math.sin(strand.angle)*(CENTER.r-1);
    const length=Math.hypot(bx-x,by-y),dx=(bx-x)/length,dy=(by-y)/length;
    if(length<=b.r+1)return null;
    return {ax:x+dx*b.r,ay:y+dy*b.r,bx,by,dx,dy,length:length-b.r};
  }
  function reset(autoStart=false){
    if(recording&&!autoStart)return toast('Stop recording before resetting.');
    stopRip();
    seed=50483;elapsed=0;finished=false;winner=null;finishedAt=-1;lastCollisionTime=0;duelClock=0;pairContacts.clear();stringsGained=0;mark=0;particles=[];rings=[];announcements=[];cutCount=0;
    if(musicAudio){musicAudio.pause();musicAudio.currentTime=0;if(autoStart)startMusic();}
    balls=slots.map((slot,i)=>makeBall(slot,i,slots.length));createThreads();
    setRunning(autoStart);updateStats();draw();
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
  function ensureAudio(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioContext){
      audioContext=new AC();
      audioReady=Promise.all(REFERENCE_SNAPS.map(async uri=>{
        const raw=atob(uri.split(',')[1]);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return audioContext.decodeAudioData(bytes.buffer);
      })).then(buffers=>snapBuffers=buffers).catch(()=>toast('Audio samples could not load.'));
      audioDestination=audioContext.createMediaStreamDestination();
      ripBus=audioContext.createGain();ripBus.gain.value=config().sfxVolume;
      // Linear mixing: no saturation or aggressive compression of stacked copies.
      ripOutput=ripBus;
      ripBus.connect(audioContext.destination);ripBus.connect(audioDestination);
      const silence=audioContext.createConstantSource();silence.offset.value=0;silence.connect(audioDestination);silence.start();
      if(musicAudio)configureMusicSource();
    }
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }
  // Every successful physical fiber cut gets its own complete original sample.
  // Normalize the shared mix instead of suppressing simultaneous cut events.
  function updateRipMix(){
    if(!ripBus||!audioContext)return;
    ripBus.gain.setTargetAtTime(config().sfxVolume/Math.max(1,activeRipSources.size),audioContext.currentTime,.004);
  }
  function stopRip(){
    for(const source of activeRipSources)source.stop();
    activeRipSources.clear();updateRipMix();
  }
  function playRip(force=false){
    const cfg=config();if(!force&&(!cfg.threads||!cfg.ripSounds))return;
    if(!audioContext||audioContext.state!=='running'||!snapBuffers.length)return;
    if(force)stopRip();
    const source=audioContext.createBufferSource();
    source.buffer=snapBuffers[0];source.playbackRate.value=1;source.loop=false;
    activeRipSources.add(source);source.connect(ripBus);updateRipMix();
    source.onended=()=>{source.disconnect();activeRipSources.delete(source);updateRipMix();};
    source.start();
  }
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
  function snapThread(strand,x,y,position){
    const owner=balls[strand.owner];
    if(finished||strand.cutAt>=0||!owner?.alive)return false;
    strand.cutAt=elapsed;strand.cutR=position;cutCount++;
    addParticles(x,y,owner.color,2,70);
    owner.hp=Math.max(0,owner.hp-1);owner.glow=1;playRip();
    if(owner.hp<=0)eliminate(owner);
    return true;
  }
  // Collision between moving balls and the fans belonging to *other* players.
  // Swept movement is checked against both the previous and current fiber
  // placement to reduce tunnelling, with a cap on simultaneous snap bursts.
  function cutEnemyThreads(active){
    if(!config().threads||!threads.length||active.length<2)return;
    const maxCutsPerBall=200;
    for(const ball of active){
      if(!ball.alive)continue;
      let cuts=0;
      for(const strand of threads){
        if(strand.cutAt>=0||strand.owner===ball.id)continue;
        const owner=balls[strand.owner];if(!owner?.alive)continue;
        const g=strandGeometry(strand);
        if(!g)continue;
        const distance=segmentDistance(ball.prevX,ball.prevY,ball.x,ball.y,g.ax,g.ay,g.bx,g.by);
        const past=strandGeometry(strand,true);
        const prevDistance=past?segmentDistance(ball.prevX,ball.prevY,ball.x,ball.y,past.ax,past.ay,past.bx,past.by):Infinity;
        if(Math.min(distance,prevDistance)>ball.r)continue;
        // Estimate where along the fiber the opponent touches it.
        const t=clamp(((ball.x-g.ax)*g.dx+(ball.y-g.ay)*g.dy)/g.length,.06,.94);
        const px=g.ax+(g.bx-g.ax)*t,py=g.ay+(g.by-g.ay)*t;
        if(snapThread(strand,px,py,t)){ball.glow=.7;ball.lastCut=elapsed;cuts++;}
        if(finished)return;
        if(cuts>=maxCutsPerBall)break;
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
    // Near the deadline, finish the physical battle instead of a time-up screen.
    const remainingTime=cfg.duration-elapsed;
    if(remainingTime<=6){
      const pressure=clamp((6-remainingTime)/6,0,1);
      const survivors=alive();
      for(const ball of survivors){
        ball.speedFloor=Math.max(ball.speedFloor,(260+pressure*340)*cfg.speed);
        if(survivors.length===2)growBall(ball,1+dt*(.22+pressure*.3));
      }
    }
    const rotationSpeed = .24;
    const active=alive();
    steerDuel(active,sdt);
    // Bouncing-ball physics: independent motion, wall reflections and pairwise impulses.
    for(const b of active){
      b.prevX=b.x;b.prevY=b.y;
      b.rotation+=sdt*1.9;
      b.glow=Math.max(0,b.glow-dt*3);
      
      
      
      
      let speed=Math.hypot(b.vx,b.vy),min=b.speedFloor,max=Math.min(MAX_SPEED*cfg.speed,Math.max(170*cfg.speed,min*1.36));
      if(speed>max){b.vx*=max/speed;b.vy*=max/speed;}
      if(speed<min){const a=Math.atan2(b.vy,b.vx);b.vx=Math.cos(a)*min;b.vy=Math.sin(a)*min;}
      b.x+=b.vx*sdt;b.y+=b.vy*sdt;
      resolveWall(b);
      b.trail.push({x:b.x,y:b.y});if(b.trail.length>8)b.trail.shift();
    }
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      const a=active[i],b=active[j];if(!a.alive||!b.alive)continue;
      let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      const min=a.r+b.r+2,key=`${a.id}:${b.id}`;
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
      // Separate using the enlarged radii, including already latched contacts.
      const overlap=(a.r+b.r+2-d)/2;
      if(overlap>0){a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;}
      if(newImpact&&active.length===2){
        a.duelSteerAfter=b.duelSteerAfter=duelClock+DUEL_SEPARATION_TIME;
        const x=a.x+nx*(a.r+1),y=a.y+ny*(a.r+1);
        const pulse=Math.max(40,Math.min(250,Math.max(a.r,b.r)*2.05));
        rings.push({x,y,t:0,color:'#fff4b0',maxRadius:pulse});
      }
    }
    // A collision may push a growing ball into the rim in the same step.
    for(const b of active)if(b.alive)resolveWall(b);
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
  function drawBackground(t){
    ctx.fillStyle='#000207';ctx.fillRect(0,0,VW,VH);
    const g=ctx.createRadialGradient(360,596,80,360,596,540);g.addColorStop(0,'#0b1728');g.addColorStop(.65,'#030c15');g.addColorStop(1,'#000207');ctx.fillStyle=g;ctx.fillRect(0,0,VW,VH);
  }
  function drawArena(t){
    ctx.save();ctx.beginPath();ctx.arc(CENTER.x,CENTER.y,CENTER.r,0,TAU);ctx.strokeStyle='#f6fbff';ctx.lineWidth=3;ctx.shadowColor='#a5d7ed';ctx.shadowBlur=5;ctx.stroke();ctx.restore();
  }
  function drawThreads(t){
    if(!config().threads)return;
    ctx.save();ctx.beginPath();ctx.arc(CENTER.x,CENTER.y,CENTER.r,0,TAU);ctx.clip();
    for(const strand of threads){
      const b=balls[strand.owner];if(!b?.alive||strand.cutAt>=0)continue;
      const g=strandGeometry(strand);if(!g)continue;
      ctx.strokeStyle=b.color;ctx.globalAlpha=.68;ctx.lineWidth=.85;
      ctx.beginPath();ctx.moveTo(g.ax,g.ay);ctx.lineTo(g.bx,g.by);ctx.stroke();
      ctx.globalAlpha=.95;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(g.bx,g.by,1.65,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
  function drawBall(b,t){
    const {x,y,r}=b;
    if(false&&b.trail.length>=2){for(let i=1;i<b.trail.length;i++){const p=b.trail[i],p0=b.trail[i-1];ctx.strokeStyle=b.color+(Math.floor(i*7+12).toString(16).padStart(2,'0'));ctx.lineWidth=r*.55*i/b.trail.length;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p.x,p.y);ctx.stroke();}}
    ctx.save();
    ctx.shadowBlur=25+b.glow*16;ctx.shadowColor=b.color;
    ctx.fillStyle='#08131c';ctx.beginPath();ctx.arc(x,y,r+5,0,TAU);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(x,y,r+4,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
    const pic=getImage(b.src);
    if(pic){
      const scale=Math.max(r*2/pic.width,r*2/pic.height), w=pic.width*scale,h=pic.height*scale;
      ctx.drawImage(pic,x-w/2,y-h/2,w,h);
    } else {
      const gradient=ctx.createLinearGradient(x-r,y-r,x+r,y+r);gradient.addColorStop(0,'#d7e7fa');gradient.addColorStop(1,'#314a68');ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
      const label=avatarText(b.name);text(x,y-1,label,label.length>2?23:25,'#071529',900);
    }
    const sheen=ctx.createLinearGradient(x-r,y-r,x+r,y+r);sheen.addColorStop(0,'#ffffff47');sheen.addColorStop(.46,'#ffffff00');sheen.addColorStop(1,'#00000022');ctx.fillStyle=sheen;ctx.fillRect(x-r,y-r,r*2,r*2);
    ctx.restore();
    ctx.beginPath();ctx.arc(x,y,r+4,0,TAU);ctx.strokeStyle=b.color;ctx.lineWidth=2;ctx.stroke();
    ctx.shadowBlur=8;ctx.shadowColor='#000';text(x,y+r+24,String(Math.ceil(b.hp)),18,'#fff',900);ctx.shadowBlur=0;
    // Full names remain editable in the control room; Shorts show portraits + HP only.
  }
  function drawParticles(){
    for(const p of particles){ctx.globalAlpha=clamp(1-p.t/p.life,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(0,p.size*(1-p.t/p.life)),0,TAU);ctx.fill();}
    ctx.shadowBlur=0;ctx.globalAlpha=1;
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
    const orig={x:b.x,y:b.y,r:b.r};b.x=360;b.y=568;b.r=65;
    const previousTrail=b.trail;b.trail=[];drawBall(b,elapsed);b.trail=previousTrail;
    b.x=orig.x;b.y=orig.y;b.r=orig.r;
    text(360,681,'WINNER!',49,'#ffffff',900);
    text(360,733,cleanLabel(b.name).toUpperCase(),33,b.color,900);
    text(360,781,b.winReason||'THE LAST BALL STANDING',14,'#a9c3d8',800,'center',2);
    ctx.restore();
  }
  function draw(){
    if(!ctx)return;
    const k=canvas.width/VW;ctx.setTransform(k,0,0,k,0,0);
    drawBackground(elapsed);
    drawHeader(elapsed);
    drawArena(elapsed);
    drawThreads(elapsed);
    drawParticles();
    const sorted=balls.filter(b=>b.alive).slice().sort((a,b)=>a.y-b.y);
    sorted.forEach(b=>drawBall(b,elapsed));
    drawAnnouncements();
    drawFooter();
    if(winner){/* Keep the surviving ball visible without a winner overlay. */}
    else if(finished){ctx.save();ctx.fillStyle='#0a122adf';rrect(90,465,540,250,26);ctx.fill();text(360,556,"TIME'S UP",43,'#f8fbff',900);text(360,620,'NO FORCED ELIMINATIONS',22,'#b1d7ef',800);ctx.restore();}
  }
  function frame(stamp){
    let dt=lastStamp?clamp((stamp-lastStamp)/1000,0,.05):0;lastStamp=stamp;
    if(simRunning){let remaining=dt;while(remaining>0&&simRunning){const tick=Math.min(remaining,1/120);step(tick);remaining-=tick;}}else step(dt);if(finished){elapsed+=dt;animateEffects(dt);}
    draw();
    if(recording&&finished&&elapsed>=finishedAt+2.4)stopRecording();
    raf=requestAnimationFrame(frame);
  }
  function setCanvasResolution(n){
    canvas.width=n;canvas.height=Math.round(n*16/9);
    $('previewResolution').textContent=`${canvas.width} × ${canvas.height}`;
    draw();
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
      $('count').value=slots.length;imageCache.clear();slots.forEach(s=>getImage(s.src));makePlayerUI();reset();toast('Project loaded successfully.');
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
  $('shufflePlayers').addEventListener('click',()=>{if(recording)return;for(let i=slots.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]]}makePlayerUI();reset()});
  for(const id of ['headline','theme','duration','speed','guarantee','cta','threads','density','cutDamage','slowmo'])$(id).addEventListener('change',()=>{if(!recording)reset()});
  $('saveProject').addEventListener('click',saveProject);
  $('loadProject').addEventListener('click',()=>$('projectFile').click());
  $('projectFile').addEventListener('change',e=>{loadProject(e.target.files?.[0]);e.target.value=''});
  document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(e.target.tagName)){
      e.preventDefault();if(!recording)togglePlayback();
    }
  });
  window.addEventListener('beforeunload',e=>{if(recording){e.preventDefault();e.returnValue='';}});
  function syncSliderLabels(){
    $('sfxVolumeReadout').textContent=$('sfxVolume').value+'%';
    $('musicVolumeReadout').textContent=$('musicVolume').value+'%';
    if(musicGain)musicGain.gain.value=config().musicVolume;
    updateRipMix();
  }
  $('sfxVolume').addEventListener('input',syncSliderLabels);
  $('musicVolume').addEventListener('input',syncSliderLabels);
  $('testRip').addEventListener('click',async()=>{
    ensureAudio();await audioReady;if(audioContext?.state==='suspended')await audioContext.resume().catch(()=>{});
    playRip(true);
  });
  $('musicFile').addEventListener('change',e=>{
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
  });
  slots=defaultSlots();makePlayerUI();syncSliderLabels();reset();raf=requestAnimationFrame(frame);
})();
