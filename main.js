import * as K from './kakuro.js';
import * as PG from './progress.js';
let mp;
try{mp=await import('./multiplayer.js')}catch(e){
  console.error('Firebase setup problem:',e);
  const why=String(e&&e.message||'').includes('Firebase config')?e.message:'Sign-in is not set up. Check firebase-config.js';
  const off=()=>{throw new Error(why)};
  mp={me:()=>null,onUser(cb){setTimeout(()=>cb(null))},signIn:off,signUp:off,guest:off,logout:async()=>{},saveProfile:async()=>{},loadProfile:async()=>null};
}

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const S={how:'basics',mist:false,lvl:1};
try{if(localStorage.getItem('kk_mist')=='1')S.mist=true}catch{}
const saveMist=()=>{try{localStorage.setItem('kk_mist',S.mist?'1':'0')}catch{}};
// storage (kk_prog = progress, kk_save = the game in progress). If the browser blocks it, the game still plays, it just can not remember.
let st;try{st=localStorage}catch{st={getItem:()=>null,setItem(){throw 0},removeItem(){}}}
const P=PG.loadProg(st);
let g=null,ctx={},upd=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

const show=id=>$$('.sc').forEach(s=>s.hidden=s.id!=id);
const say=(id,m)=>$('#'+id).textContent=m||'';
const fe=e=>({'auth/email-already-in-use':'That username is taken','auth/invalid-credential':'Wrong username or password','auth/user-not-found':'Wrong username or password','auth/wrong-password':'Wrong username or password','auth/operation-not-allowed':'Turn on Email/Password sign-in in Firebase','auth/network-request-failed':'No connection','auth/admin-restricted-operation':'Turn on Anonymous sign-in in Firebase','permission-denied':'The database rules are blocking this. Check the Firestore rules.'}[e.code]||e.message||String(e));

/* ---------- sound: your files if present, otherwise synthesised ---------- */
let ac=null,muted=false,soundsLoaded=false;const bufs={};
try{muted=localStorage.getItem('kk_mute')=='1'}catch{}
const audio=()=>{
  if(!ac){try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch{return null}}
  if(ac.state=='suspended')ac.resume();return ac;
};
async function loadSounds(){
  if(soundsLoaded)return;soundsLoaded=true;
  const a=audio();if(!a)return;
  for(const n of ['tap','note','erase','hint','win','start']){
    try{const r=await fetch(n+'.mp3');if(!r.ok)continue;bufs[n]=await a.decodeAudioData(await r.arrayBuffer())}catch{}
  }
}
document.addEventListener('pointerdown',()=>{audio();loadSounds()},{passive:true});
function playBuf(n,v=1){
  const a=audio(),b=bufs[n];if(!a||muted||!b)return false;
  const s=a.createBufferSource(),gn=a.createGain();gn.gain.value=v;s.buffer=b;s.connect(gn).connect(a.destination);s.start();return true;
}
function tone(f,t0,d,type,v){
  const a=audio();if(!a||muted)return;
  const o=a.createOscillator(),gn=a.createGain(),t=a.currentTime+t0;
  o.type=type;o.frequency.setValueAtTime(f,t);gn.gain.setValueAtTime(v,t);gn.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(gn).connect(a.destination);o.start(t);o.stop(t+d);
}
const sfx={
  tap(){if(playBuf('tap'))return;tone(660,0,.07,'triangle',.16)},
  note(){if(playBuf('note',.7))return;tone(990,0,.05,'sine',.1)},
  erase(){if(playBuf('erase'))return;tone(330,0,.08,'triangle',.12)},
  hint(){if(playBuf('hint'))return;tone(784,0,.15,'triangle',.16);tone(1047,.11,.25,'triangle',.16)},
  start(){if(playBuf('start'))return;[392,523,659].forEach((f,i)=>tone(f,i*.09,.18,'triangle',.14))},
  win(){if(playBuf('win'))return;[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,i*.13,.32,'triangle',.22));tone(262,0,1,'sine',.14)}
};
const setMuteLabel=()=>$('#mute').textContent=muted?'Muted':'Sound';
setMuteLabel();
$('#mute').onclick=()=>{muted=!muted;try{localStorage.setItem('kk_mute',muted?'1':'0')}catch{}setMuteLabel();if(!muted)sfx.tap()};

/* ---------- characters ---------- */
const AVS=['🦁','🐯','🐼','🦊','🐸','🐵','🦄','🐲','🤖','👑','🥷','🧙','👻','🐧','🦖','🐙'];
const myAv=()=>{try{return localStorage.getItem('kk_av')||AVS[0]}catch{return AVS[0]}};
const setAv=a=>{try{localStorage.setItem('kk_av',a)}catch{}if(mp.me())mp.saveProfile(a).catch(()=>{})};
function buildAvGrid(){
  const gr=$('#avgrid');gr.innerHTML='';
  AVS.forEach(a=>{
    const b=document.createElement('button');b.textContent=a;b.setAttribute('aria-label','Character '+a);
    b.classList.toggle('on',a==myAv());
    b.onclick=()=>{setAv(a);buildAvGrid()};gr.append(b);
  });
}

/* ---------- menu ---------- */
function markSeg(){
  $$('.seg').forEach(sg=>[...sg.children].forEach(b=>b.classList.toggle('on',String(S[sg.dataset.k])==b.dataset.v)));
  $$('.hp').forEach(p=>p.hidden=p.dataset.t!=S.how);
}
$$('.seg').forEach(sg=>sg.onclick=e=>{const b=e.target.closest('button');if(!b)return;S[sg.dataset.k]=isNaN(b.dataset.v)?b.dataset.v:+b.dataset.v;markSeg()});
markSeg();
// small diagram boards on the How to play screen. Cells are separated by commas, rows by |
// #: black   A16 / D4 / A16D4: clue cell   .: empty   5: digit   .*: highlighted   3!: wrong digit   n125: notes 1, 2 and 5
$$('.mini[data-s]').forEach(x=>{
  const rows=x.dataset.s.split('|').map(r=>r.split(','));
  x.style.gridTemplateColumns='repeat('+rows[0].length+',1fr)';
  x.innerHTML=rows.flat().map(t=>{
    if(t=='#')return '<i class="b"></i>';
    const m=/^(?:A(\d+))?(?:D(\d+))?$/.exec(t);
    if(m&&(m[1]||m[2]))return '<i class="ck">'+(m[1]?'<em class="a">'+m[1]+'</em>':'')+(m[2]?'<em class="d">'+m[2]+'</em>':'')+'</i>';
    if(/^n\d+$/.test(t))return '<i class="nn">'+[1,2,3,4,5,6,7,8,9].map(d=>'<s>'+(t.includes(d)?d:'')+'</s>').join('')+'</i>';
    let cls='',s=t;
    if(s.endsWith('*')){cls+=' hl';s=s.slice(0,-1)}
    if(s.endsWith('!')){cls+=' er';s=s.slice(0,-1)}
    return '<i class="'+cls.trim()+'">'+(s=='.'?'':s)+'</i>';
  }).join('');
});

function renderMe(){
  const u=mp.me(),m=$('#me');m.innerHTML='';
  const ab=document.createElement('button');ab.className='avbtn';ab.textContent=myAv();ab.setAttribute('aria-label','Choose your character');
  ab.onclick=()=>{buildAvGrid();show('chars')};m.append(ab);
  const un=document.createElement('span');un.className='uname';un.textContent=u?u.name:'Not signed in';m.append(un);
  const b=document.createElement('button');b.className='btn';
  if(u){b.textContent='Log out';b.onclick=async()=>{await mp.logout();renderMe()}}
  else{b.textContent='Sign in';b.onclick=()=>show('auth')}
  m.append(b);
}
async function syncProfile(){
  try{const p=await mp.loadProfile();if(p&&p.kkav&&p.kkav!=myAv()){try{localStorage.setItem('kk_av',p.kkav)}catch{}renderMe()}}catch{}
}
mp.onUser(u=>{renderMe();if(u)syncProfile()});
renderMe();
try{const lu=localStorage.getItem('kk_user');if(lu)$('#u').value=lu}catch{}

function leave(){
  pauseClock();
  ['t1','nt'].forEach(k=>clearTimeout(ctx[k]));clearInterval(ctx.tt);
  ctx={};g=null;
  $('#result').hidden=true;$('#dlg').hidden=true;
  $('#note').textContent='';
  $('#rreplay').disabled=false;
}
function home(){persist();leave();show('home');renderMe();renderHome();applyUpdate()}

$$('[data-go]').forEach(b=>b.onclick=()=>{
  const v=b.dataset.go;
  if(v=='how'){S.how='basics';markSeg();return show('how')}
  if(v=='play'){setLv(PG.unlockedLevel(P));return show('setup')}
});

async function doAuth(create){
  const u=$('#u').value.trim(),p=$('#p').value;
  if(!/^[A-Za-z0-9_]{3,14}$/.test(u))return say('aerr','Username: 3-14 letters, numbers or _');
  if(p.length<6)return say('aerr','Password needs 6 or more characters');
  try{
    create?await mp.signUp(u,p):await mp.signIn(u,p);
    try{localStorage.setItem('kk_user',u)}catch{}
    say('aerr');$('#p').value='';
    if(create)mp.saveProfile(myAv()).catch(()=>{});else await syncProfile();
    afterAuth();
  }catch(e){say('aerr',fe(e))}
}
$('#guest').onclick=async()=>{
  const t=$('#u').value.trim(),name=/^[A-Za-z0-9_]{3,14}$/.test(t)?t:'Guest'+(1000+Math.floor(Math.random()*9000));
  try{await mp.guest(name);say('aerr');afterAuth()}catch(e){say('aerr',fe(e))}
};
$('#signin').onclick=()=>doAuth(false);
$('#signup').onclick=()=>doAuth(true);
function afterAuth(){renderMe();show('home')}

/* ---------- home and level picker ---------- */
const DIFF=['Gentle','Easy','Medium','Hard','Expert'],LOGIC=['give-aways only','give-aways and crossings','careful deduction','one step of trial and error'];
const fmt=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const saved=()=>PG.readSave(st);
const clearSave=()=>PG.clearSave(st);
function renderHome(){
  const sv=saved(),c=$('#cont');
  $('#lvsub').textContent='Level '+PG.unlockedLevel(P)+(P.cleared?' · '+P.cleared+' cleared':'');
  c.hidden=!sv;if(sv)c.textContent='▶ Continue '+sv.meta.title+' ('+fmt(sv.ms)+')';
}
$('#cont').onclick=()=>{const sv=saved();if(sv)resume(sv);else renderHome()};
const clampLv=n=>Math.max(1,Math.min(PG.unlockedLevel(P),Math.floor(n)||1));   // only levels up to your next new one
function lvInfo(){
  const P0=K.levelProfile(S.lvl),k=Math.min(4,Math.floor(P0.d*5)),sv=saved(),mine=sv&&sv.meta.level==S.lvl,b=P.best[S.lvl];
  const status=mine?'In progress · '+fmt(sv.ms):b?'Best time '+fmt(b.ms)+' · '+b.a+(b.a==1?' attempt':' attempts')+' · '+b.h+(b.h==1?' hint':' hints'):S.lvl==PG.unlockedLevel(P)?'New level':'';
  $('#lvinfo').innerHTML='<b>Level '+S.lvl+'</b><span class="dots">'+[0,1,2,3,4].map(i=>'<i class="'+(i<=k?'on':'')+'"></i>').join('')+'</span><br>'+
    DIFF[k]+' · grid '+P0.cols+' × '+P0.rows+'<br>Runs up to '+P0.maxRun+' squares long<br>Logic: '+LOGIC[Math.min(3,P0.tHi-1)]+(status?'<br>'+status:'');
  $('#play').textContent=mine?'Resume':'Play';
  $('#restart').hidden=!mine;
  $('#lvcur').hidden=S.lvl==PG.unlockedLevel(P);
  $('#lvm').disabled=S.lvl<=1;$('#lvp').disabled=S.lvl>=PG.unlockedLevel(P);
}
function setLv(n){S.lvl=clampLv(n);$('#lvn').value=S.lvl;lvInfo()}
$('#lvm').onclick=()=>setLv(S.lvl-1);
$('#lvp').onclick=()=>setLv(S.lvl+1);
$('#lvcur').onclick=()=>setLv(PG.unlockedLevel(P));
$('#lvn').oninput=()=>{S.lvl=clampLv(+$('#lvn').value.replace(/\D/g,''));lvInfo()};
$('#lvn').onchange=()=>setLv(S.lvl);
$('#play').onclick=()=>{
  const sv=saved();
  if(sv&&sv.meta.level==S.lvl)return resume(sv);
  if(sv)return ask('Start a new level?','You have '+sv.meta.title+' in progress. Starting Level '+S.lvl+' will discard it.','Discard',()=>{clearSave();makeLevel(S.lvl,$('#play'))});
  makeLevel(S.lvl,$('#play'));
};
$('#restart').onclick=()=>ask('Start over?','Your progress on Level '+S.lvl+' will be erased and you get a fresh board. It counts as another attempt.','Start over',()=>{clearSave();makeLevel(S.lvl,$('#play'))});
// the generator can take up to a second on a big level on a slow phone, so the button says so first
function makeLevel(N,btn){
  const label=btn.textContent;btn.disabled=true;btn.textContent='Making puzzle...';
  setTimeout(()=>{   // let the button repaint before the generator takes the thread
    let pz=null;try{pz=K.levelPuzzle(N)}catch(e){console.error(e)}
    btn.disabled=false;btn.textContent=label;
    if(!pz)return ask('Sorry','Could not make this puzzle. Try another level.','OK',()=>{},true);
    newGame(pz,{type:'level',level:N,title:'Level '+N});
  },30);
}
function resume(sv){newGame(sv.pz,sv.meta,sv)}

/* ---------- the game ---------- */
// restore = a checked save from readSave(): the board, notes, hints, time and undo history come back exactly as left
function newGame(pz,meta,restore){
  leave();
  const ur=K.uiRuns(pz),N=pz.rows*pz.cols,W=pz.t.reduce((a,b)=>a+b,0);
  g={pz,meta,R:pz.rows,C:pz.cols,N,runs:ur.runs,ra:ur.ra,rd:ur.rd,sol:Array.from(pz.sol,Number),
     v:new Int8Array(N),n:new Uint16Array(N),lock:new Uint8Array(N),sel:-1,pencil:false,hist:[],redo:[],
     hints:0,hintMax:Math.max(2,Math.min(5,2+Math.floor(W/12))),checks:0,mist:S.mist,st:'play',ms:0,t0:0,moves:0,counted:false,els:[]};
  if(restore){
    for(let i=0;i<N;i++){g.v[i]=+restore.cells[i];g.n[i]=restore.n[i];g.lock[i]=+restore.lock[i]}
    Object.assign(g,{hints:restore.hints,hintMax:restore.hintMax,checks:restore.checks,ms:restore.ms,moves:restore.moves,counted:restore.counted,pencil:restore.pencil,hist:restore.hist});
  }
  $('#gtitle').textContent=meta.title;
  show('game');buildBoard();syncAll();startClock();if(!restore)sfx.start();
}
function buildBoard(){
  const el=$('#kgrid');el.innerHTML='';el.style.setProperty('--C',g.C);
  for(let i=0;i<g.N;i++){
    let k;
    if(g.pz.t[i]){
      k=document.createElement('button');k.className='w';k.dataset.i=i;
      k.innerHTML='<span class="dg"></span><span class="nt">'+'<i></i>'.repeat(9)+'</span>';
      k.setAttribute('aria-label','Square, row '+((i/g.C|0))+', column '+(i%g.C));
      k.onclick=()=>pick(i);
    }else{
      k=document.createElement('div');k.className='k';
      const a=g.pz.a[i],d=g.pz.d[i];
      if(a||d){k.classList.add('ck');if(a)k.innerHTML+='<i class="ca">'+a+'</i>';if(d)k.innerHTML+='<i class="cd">'+d+'</i>'}
    }
    g.els.push(k);el.append(k);
  }
  fit();
}
// cell size: as big as fits the phone's width and the height left over, never above 62px
function fit(){
  if(!g)return;
  const bw=Math.min($('#kwrap').clientWidth||innerWidth-24,480)-8,ah=innerHeight-318;
  const cs=Math.max(24,Math.min(62,Math.floor(Math.min((bw-(g.C-1))/g.C,(ah-(g.R-1))/g.R))));
  $('#kgrid').style.setProperty('--cs',cs+'px');
}
addEventListener('resize',fit);

// write the game in progress to storage. Cheap (about 1-2 KB), so it runs after every change.
function persist(){
  if(!g||g.meta.type!='level')return;
  if(g.st=='done'){clearSave();return}
  if(g.moves>0||g.counted)PG.writeSave(st,g,elapsed());
}
// an attempt is counted when the first digit (or hint) goes on a fresh board
function countAttempt(){
  if(g.counted||g.meta.type!='level')return;
  g.counted=true;PG.startAttempt(P,'L'+g.meta.level);PG.saveProg(st,P);
}
addEventListener('pagehide',persist);
function pick(i){if(!g||g.st!='play')return;g.sel=i;syncAll()}
// re-draw everything that depends on the board state: digits, notes, highlights, sums, pad and tool buttons
function syncAll(){
  if(!g)return;
  const dup=new Uint8Array(g.N),inRun=new Uint8Array(g.N),sel=g.sel;
  for(const r of g.runs){const seen={};for(const i of r.cells){const d=g.v[i];if(d)(seen[d]=seen[d]||[]).push(i)}for(const d in seen)if(seen[d].length>1)seen[d].forEach(i=>dup[i]=1)}
  const ar=sel>=0?g.ra[sel]:-1,dr=sel>=0?g.rd[sel]:-1;
  if(ar>=0)g.runs[ar].cells.forEach(i=>inRun[i]=1);
  if(dr>=0)g.runs[dr].cells.forEach(i=>inRun[i]=1);
  for(let i=0;i<g.N;i++){
    const k=g.els[i];
    if(g.pz.t[i]){
      const v=g.v[i],n=g.n[i];
      k.firstChild.textContent=v||'';
      k.lastChild.childNodes.forEach((c,x)=>{c.textContent=n>>x&1?x+1:''});
      k.classList.toggle('has',!!v);k.classList.toggle('sel',i==sel);k.classList.toggle('hl',!!inRun[i]&&i!=sel);
      k.classList.toggle('err',!!dup[i]);k.classList.toggle('bad',g.mist&&!!v&&v!==g.sol[i]);k.classList.toggle('lock',!!g.lock[i]);
      k.disabled=g.st!='play';
    }else if(k.classList.contains('ck')){
      k.classList.toggle('oa',ar>=0&&g.runs[ar].clue==i);k.classList.toggle('od',dr>=0&&g.runs[dr].clue==i);
    }
  }
  // running sums of the selected runs
  const box=$('#runs');box.innerHTML='';
  if(sel<0){const d=document.createElement('div');d.className='rc idle';d.textContent=g.st=='play'?'Tap a white square':'';box.append(d)}
  else for(const [r,sym] of [[ar,'→'],[dr,'↓']]){
    const run=g.runs[r];let cur=0,full=true;for(const i of run.cells){cur+=g.v[i];if(!g.v[i])full=false}
    const d=document.createElement('div');d.className='rc'+(cur>run.sum?' over':full&&cur==run.sum?' full':'');
    d.textContent=sym+' '+cur+' / '+run.sum;box.append(d);
  }
  // digits already used in the selected runs are dimmed on the pad
  let used=0;
  if(sel>=0)for(const r of [ar,dr])for(const i of g.runs[r].cells)if(i!==sel&&g.v[i])used|=1<<(g.v[i]-1);
  $$('.nb').forEach(b=>b.classList.toggle('used',!!(used>>(+b.dataset.d-1)&1)));
  $('#pad').classList.toggle('pencil',g.pencil);
  $('#undo').disabled=!g.hist.length||g.st!='play';$('#redo').disabled=!g.redo.length||g.st!='play';
  $('#erase').disabled=g.st!='play';
  $('#notes').setAttribute('aria-pressed',g.pencil);$('#mist').setAttribute('aria-pressed',g.mist);
  const left=g.hintMax-g.hints;$('#hintbtn').lastChild.textContent='Hint '+left;$('#hintbtn').disabled=left<=0||g.st!='play';
}
function note(m,ms){clearTimeout(ctx.nt);$('#note').textContent=m||'';if(m&&ms)ctx.nt=setTimeout(()=>{$('#note').textContent=''},ms)}

/* ---- input: every change is a list of per-square changes, so Undo and Redo are exact ---- */
function put(ch,dir){for(const c of dir?ch:ch.slice().reverse()){if(g.lock[c.i])continue;g.v[c.i]=dir?c.v1:c.v0;g.n[c.i]=dir?c.n1:c.n0}}
function commit(ch){
  if(!ch.length)return;
  put(ch,true);g.hist.push(ch);if(g.hist.length>400)g.hist.shift();g.redo.length=0;g.moves++;
  syncAll();checkDone();persist();
}
function press(d){
  if(!g||g.st!='play')return;
  const i=g.sel;if(i<0){note('Tap a white square first.',2200);return}
  if(g.lock[i]){note('That square was filled by a hint.',2200);return}
  if(g.pencil){
    if(g.v[i]){note('Erase the digit first to write notes.',2200);return}
    commit([{i,v0:0,n0:g.n[i],v1:0,n1:g.n[i]^(1<<(d-1))}]);sfx.note();return;
  }
  if(g.v[i]==d)return;
  const ch=[{i,v0:g.v[i],n0:g.n[i],v1:d,n1:0}],b=1<<(d-1);
  for(const r of [g.ra[i],g.rd[i]])for(const j of g.runs[r].cells)if(j!==i&&!g.v[j]&&(g.n[j]&b))ch.push({i:j,v0:0,n0:g.n[j],v1:0,n1:g.n[j]&~b});
  countAttempt();commit(ch);sfx.tap();
}
function erase(){
  if(!g||g.st!='play'||g.sel<0)return;
  const i=g.sel;if(g.lock[i])return;
  if(g.v[i]){commit([{i,v0:g.v[i],n0:g.n[i],v1:0,n1:0}]);sfx.erase()}
  else if(g.n[i]){commit([{i,v0:0,n0:g.n[i],v1:0,n1:0}]);sfx.erase()}
}
function undo(){if(!g||g.st!='play'||!g.hist.length)return;const ch=g.hist.pop();put(ch,false);g.redo.push(ch);sfx.erase();syncAll();persist()}
function redo(){if(!g||g.st!='play'||!g.redo.length)return;const ch=g.redo.pop();put(ch,true);g.hist.push(ch);sfx.tap();syncAll();persist()}
function hint(){
  if(!g||g.st!='play'||g.hints>=g.hintMax)return;
  let i=g.sel;
  if(!(i>=0&&g.pz.t[i])||g.v[i]==g.sol[i])i=K.hintCell(g.pz,g.v);   // a selected square gets its digit; otherwise the easiest square to work out
  if(i<0)return;
  const d=g.sol[i],b=1<<(d-1);
  g.v[i]=d;g.n[i]=0;g.lock[i]=1;g.hints++;g.sel=i;
  for(const r of [g.ra[i],g.rd[i]])for(const j of g.runs[r].cells)if(j!==i&&!g.v[j])g.n[j]&=~b;
  countAttempt();sfx.hint();syncAll();checkDone();persist();
}
$$('.nb').forEach(b=>b.onclick=()=>press(+b.dataset.d));
$('#undo').onclick=undo;$('#redo').onclick=redo;$('#erase').onclick=erase;$('#hintbtn').onclick=hint;
const toggleNotes=()=>{if(!g||g.st!='play')return;g.pencil=!g.pencil;syncAll();persist()};
$('#notes').onclick=toggleNotes;
$('#mist').onclick=()=>{if(!g||g.st!='play')return;g.mist=!g.mist;S.mist=g.mist;saveMist();if(g.mist)g.checks++;syncAll();persist()};
addEventListener('keydown',e=>{
  if(!g||cur()!='game'||!$('#dlg').hidden||!$('#result').hidden||e.target.tagName=='INPUT')return;
  const k=e.key;
  if(k>='1'&&k<='9'&&!e.ctrlKey&&!e.metaKey)press(+k);
  else if(k=='Backspace'||k=='Delete'||k=='0')erase();
  else if(k=='n'||k=='N')toggleNotes();
  else if((e.ctrlKey||e.metaKey)&&k.toLowerCase()=='z'){e.preventDefault();e.shiftKey?redo():undo()}
  else if((e.ctrlKey||e.metaKey)&&k.toLowerCase()=='y'){e.preventDefault();redo()}
  else if(k.startsWith('Arrow')){
    e.preventDefault();
    let i=g.sel>=0?g.sel:g.pz.t.indexOf(1);
    const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-g.C,ArrowDown:g.C}[k];
    if(g.sel>=0){let j=i;for(;;){const nj=j+step;if(nj<0||nj>=g.N||(Math.abs(step)==1&&((j%g.C==0&&step<0)||(j%g.C==g.C-1&&step>0))))break;j=nj;if(g.pz.t[j]){i=j;break}}}
    pick(i);
  }
});

/* ---- clock: counts only while the puzzle is on screen and the app is visible ---- */
const elapsed=()=>g?g.ms+(g.t0?performance.now()-g.t0:0):0;
const tick=()=>{$('#time').textContent=g?fmt(elapsed()):'0:00'};
function startClock(){if(!g||g.st!='play')return;if(!g.t0)g.t0=performance.now();clearInterval(ctx.tt);ctx.tt=setInterval(tick,500);tick()}
function pauseClock(){if(g&&g.t0){g.ms+=performance.now()-g.t0;g.t0=0}clearInterval(ctx.tt)}
document.addEventListener('visibilitychange',()=>{
  if(!g||g.st!='play')return;
  if(document.visibilityState=='hidden'){pauseClock();persist()}else if(cur()=='game'&&$('#dlg').hidden)startClock();
});

/* ---- finishing ---- */
function checkDone(){
  if(!g||g.st!='play')return;
  for(let i=0;i<g.N;i++)if(g.pz.t[i]&&!g.v[i])return;
  if(!K.isSolved(g.pz,g.runs,g.v))return;
  g.st='done';pauseClock();tick();g.sel=-1;syncAll();
  if(g.meta.type=='level'){g.rec=PG.recordClear(P,{level:g.meta.level,ms:g.ms,hints:g.hints});PG.saveProg(st,P)}   // saved now, so closing the app during the animation loses nothing
  if(!reduced){let n=0;g.els.forEach(k=>{if(k.classList.contains('w')){k.style.setProperty('--k',n++);k.classList.add('done')}})}
  sfx.win();ctx.t1=setTimeout(showResult,reduced?200:1100);
}
// step 3 sends {type, level, time, attempts, hints, finished} to Firebase from here (g.rec has them)
function showResult(){
  if(!g||g.st!='done'||!g.rec)return;
  const r=g.rec,list=$('#rlist');list.innerHTML='';
  $('#rtitle').textContent=g.meta.title+(r.first?' cleared!':' solved!');
  [['⏱','Time',fmt(g.ms)],['🏆','Best time',fmt(r.best.ms)+(r.newBest&&!r.first?'  new!':'')],['💡','Hints used',g.hints+' of '+g.hintMax],['🔁','Attempts',String(r.attempts)]].forEach(([ic,nm,val],i)=>{
    const row=document.createElement('div');row.className='rrow'+(i==0?' r0':'');
    const av=document.createElement('span');av.className='rav';av.textContent=ic;
    const n=document.createElement('span');n.className='nm';n.textContent=nm;
    const t=document.createElement('span');t.textContent=val;
    row.append(av,n,t);list.append(row);
  });
  if(r.first)list.append(Object.assign(document.createElement('p'),{className:'hint',textContent:'Level '+PG.unlockedLevel(P)+' is unlocked.'}));
  confetti(true);$('#result').hidden=false;
}
function confetti(on){
  const cf=$('#confetti');cf.innerHTML='';
  if(on&&!reduced)for(let i=0;i<26;i++){
    const s=document.createElement('span');s.textContent=['🎉','✨','⭐','🎊'][i%4];
    s.style.left=Math.random()*100+'%';s.style.animationDuration=3+Math.random()*3+'s';s.style.animationDelay=Math.random()*3+'s';cf.append(s);
  }
}
$('#rmenu').onclick=home;
$('#rnext').onclick=()=>{if(g)makeLevel(g.meta.level+1,$('#rnext'))};
$('#rreplay').onclick=()=>{if(!g)return;const pz=g.pz,meta=g.meta;$('#result').hidden=true;newGame(pz,meta)};
$('#rshare').onclick=()=>shareApp('I solved '+(g?g.meta.title+' in '+fmt(g.ms)+' ':'a puzzle ')+'on Supermania Kakuro! Come play:');

/* ---------- share app ---------- */
async function shareApp(text){
  const url=location.origin+location.pathname.replace(/index\.html$/,'');
  text=text||'Play Supermania Kakuro with me!';
  if(navigator.share){try{await navigator.share({title:'Supermania Kakuro',text,url});return}catch(e){if(e.name=='AbortError')return}}
  window.open('https://wa.me/?text='+encodeURIComponent(text+'\n'+url),'_blank');
}
$('#shareapp').onclick=()=>shareApp();

/* ---------- "are you sure?" and the phone's back button ---------- */
function ask(title,text,yes,cb,info){
  if(g&&g.st=='play')pauseClock();
  $('#dno').hidden=!!info;
  $('#dt').textContent=title;$('#dp').textContent=text;$('#dyes').textContent=yes;
  $('#dyes').onclick=()=>{closeDlg();cb()};$('#dno').onclick=closeDlg;$('#dlg').hidden=false;
}
const closeDlg=()=>{$('#dlg').hidden=true;if(g&&g.st=='play'&&cur()=='game')startClock()};
const cur=()=>($$('.sc').find(s=>!s.hidden)||{}).id;
function leaveFlow(){
    home();   // a puzzle in progress is saved, so leaving needs no warning: it waits under Continue
}
$$('[data-back]').forEach(b=>b.onclick=leaveFlow);
let armed=false,exiting=false;
document.addEventListener('pointerdown',()=>{if(!armed){armed=true;history.pushState({sm:1},'')}},{passive:true});
addEventListener('popstate',()=>{
  armed=false;
  if(exiting)return;
  if(!$('#dlg').hidden){closeDlg();return}
  if(!$('#result').hidden){home();return}
  if(cur()=='home')ask('Exit app?','Do you want to exit Supermania Kakuro?','Exit',()=>{exiting=true;try{window.close()}catch{}history.go(-2)});
  else leaveFlow();
});

/* ---------- updates come from the network, never a stale cache ---------- */
if('serviceWorker' in navigator){
  const had=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{
    r.update();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState=='visible')r.update()});
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloaded){reloaded=true;upd=true;applyUpdate()}});
}
// Resuming an installed app does not reload it, so compare the files on the server with the ones this
// page started with. A newer version reloads the app as soon as it is on a menu screen (never mid-game).
async function fileSig(){
  let h=0;
  for(const f of ['index.html','main.js','multiplayer.js','kakuro.js','progress.js','style.css','manifest.json','firebase-config.js']){
    const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw 0;
    const t=await r.text();for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;
  }
  return h;
}
let sig0=null;
async function checkUpdate(){
  if(!navigator.onLine||document.visibilityState!='visible')return;
  try{const s=await fileSig();if(sig0===null)sig0=s;else if(s!==sig0)upd=true}catch{}
  applyUpdate();
}
function applyUpdate(){
  if(!upd)return;
  if(!['home','how','setup','chars','auth'].includes(cur())||!$('#result').hidden||!$('#dlg').hidden)return;
  location.reload();
}
checkUpdate();
document.addEventListener('visibilitychange',checkUpdate);
setInterval(checkUpdate,120000);

/* ---------- install button ---------- */
let installEvt=null;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
let installedNow=false;
const showInstall=()=>{$('#install').hidden=!!standalone||installedNow};
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;showInstall()});
addEventListener('appinstalled',()=>{installEvt=null;installedNow=true;showInstall()});
$('#install').onclick=async()=>{
  if(installEvt){installEvt.prompt();await installEvt.userChoice;installEvt=null;showInstall()}
  else if(isIOS)ask('Install on iPhone','Tap the Share button in Safari, then choose Add to Home Screen.','OK',()=>{},true);
  else installHelp();
};
// the browser has not offered its install prompt: say why it may be, and show what it sees
async function installHelp(){
  let m={};const mu=document.querySelector('link[rel=manifest]').href;
  try{m=await (await fetch(mu,{cache:'no-store'})).json()}catch{}
  const start=new URL(m.start_url||'.',mu),id=m.id?new URL(m.id,start.origin).href:'(none)',scope=new URL(m.scope||'.',mu).href;
  ask('Install app',
   'Chrome has not offered its install prompt. Try the 3 dot menu, then Install app or Add to Home screen.\n\n'+
   'If it says already installed, uninstall the older copy (long-press its icon, Uninstall), then clear this site\'s data in Chrome and reload.\n\n'+
   'This app sees:\nid: '+id+'\nscope: '+scope,'OK',()=>{},true);
}
showInstall();
renderHome();
