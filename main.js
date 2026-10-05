import * as K from './kakuro.js';
import * as PG from './progress.js';
let mp;
try{mp=await import('./multiplayer.js')}catch(e){
  console.error('Firebase setup problem:',e);
  const why=String(e&&e.message||'').includes('Firebase config')?e.message:'Sign-in is not set up. Check firebase-config.js';
  const off=()=>{throw new Error(why)};
  mp={me:()=>null,onUser(cb){setTimeout(()=>cb(null))},signIn:off,signUp:off,guest:off,logout:async()=>{},saveProfile:async()=>{},loadProfile:async()=>null,googleSignIn:off,loadSummary:async()=>null,syncClear:off,submitBoard:off,fetchBoard:off,myRank:off,submitLevelBoard:off,fetchLevelBoard:off,myLevelRank:off};
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
const fe=e=>({'auth/email-already-in-use':'That username is taken','auth/invalid-credential':'Wrong username or password','auth/user-not-found':'Wrong username or password','auth/wrong-password':'Wrong username or password','auth/operation-not-allowed':'This sign-in method is not turned on in Firebase','auth/network-request-failed':'No connection','auth/admin-restricted-operation':'Turn on Anonymous sign-in in Firebase','permission-denied':'The database rules are blocking this. Check the Firestore rules.','auth/popup-closed-by-user':'Google sign-in was cancelled','auth/popup-blocked':'Your browser blocked the Google window. Allow pop-ups for this site and try again.','auth/unauthorized-domain':'This website is not in Firebase Authorized domains (Authentication, Settings).','auth/account-exists-with-different-credential':'That email already has an account that uses a different sign-in method.','auth/cancelled-popup-request':''}[e.code]||e.message||String(e));

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
  $('#guest').hidden=!!u;   // already signed in as a guest: only the account options make sense
  if(u&&!u.anon){b.textContent='Log out';b.onclick=async()=>{await mp.logout();renderMe()}}
  else{b.textContent=u?'Save progress':'Sign in';b.onclick=()=>show('auth')}   // a guest signing up keeps everything they have done
  m.append(b);
}
async function syncProfile(){
  try{const p=await mp.loadProfile();if(p&&p.kkav&&p.kkav!=myAv()){try{localStorage.setItem('kk_av',p.kkav)}catch{}renderMe()}}catch{}
}
let recUid='',recBusy=false,needPush=false,flushing=false,again=false,dailyTimer=0;   // sync state, see the Sync section
mp.onUser(u=>{renderMe();if(u){syncProfile();reconcile()}else recUid=''});
renderMe();
try{const lu=localStorage.getItem('kk_user');if(lu)$('#u').value=lu}catch{}

function leave(){
  pauseClock();
  ['t1','nt'].forEach(k=>clearTimeout(ctx[k]));clearInterval(ctx.tt);
  ctx={};g=null;clearInterval(dailyTimer);
  $('#result').hidden=true;$('#dlg').hidden=true;
  $('#note').textContent='';
  $('#rreplay').disabled=false;
}
function home(){persist();leave();show('home');renderMe();renderHome();applyUpdate()}

$$('[data-go]').forEach(b=>b.onclick=()=>{
  const v=b.dataset.go;
  if(v=='how'){S.how='basics';markSeg();return show('how')}
  if(v=='play'){setLv(PG.unlockedLevel(P));return show('setup')}
  if(v=='daily')return openDaily();
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
$('#google').onclick=async()=>{
  try{await mp.googleSignIn();say('aerr');await syncProfile();afterAuth()}catch(e){say('aerr',fe(e))}
};
$('#signin').onclick=()=>doAuth(false);
$('#signup').onclick=()=>doAuth(true);
function afterAuth(){renderMe();show('home');renderHome();reconcile()}   // a guest who just linked an account keeps the same uid, so onUser does not fire: reconcile here

/* ---------- home and level picker ---------- */
const DIFF=['Gentle','Easy','Medium','Hard','Expert'],LOGIC=['give-aways only','give-aways and crossings','careful deduction','one step of trial and error'];
const fmt=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const saved=()=>PG.readSave(st);
const clearSave=()=>PG.clearSave(st);
const today=()=>PG.dayNum(Date.now());
function renderHome(){
  const t=today();PG.rollDay(P,t);
  let sv=saved();
  if(sv&&sv.meta.type=='daily'&&sv.meta.day!==PG.dayKey(t)){clearSave();sv=null}   // yesterday's daily can no longer be finished for credit
  const c=$('#cont'),sk=PG.streakNow(P,t);
  $('#lvsub').textContent='Level '+PG.unlockedLevel(P)+(P.cleared?' · '+P.cleared+' cleared':'');
  $('#dsub').textContent=PG.doneCount(P)+' of 5 today'+(sk?' · 🔥'+sk:'');
  c.hidden=!sv;if(sv)c.textContent='▶ Continue '+sv.meta.title+' ('+fmt(sv.ms)+')';
}
$('#cont').onclick=()=>{const sv=saved();if(sv)resume(sv);else renderHome()};
const clampLv=n=>Math.max(1,Math.min(PG.unlockedLevel(P),Math.floor(n)||1));   // only levels up to your next new one
function lvInfo(){
  const P0=K.levelProfile(S.lvl),k=Math.min(4,Math.floor(P0.d*5)),sv=saved(),mine=sv&&sv.meta.level==S.lvl,b=P.best[S.lvl];
  const status=mine?'In progress · '+fmt(sv.ms):b?'Best score '+fmt(PG.levelScore(b))+' · '+b.a+(b.a==1?' attempt':' attempts')+' · '+b.h+(b.h==1?' hint':' hints'):S.lvl==PG.unlockedLevel(P)?'New level':'';
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

/* ---------- Daily 5 ---------- */
let shownDay='';
const dailyMeta=(day,k,practice)=>({type:'daily',day:PG.dayKey(day),idx:k,title:'Daily '+(k+1)+(practice?' (practice)':''),...(practice?{practice:true}:{})});
const countdown=()=>{const s=Math.floor(PG.msToNextDay(Date.now())/60000);return Math.floor(s/60)+'h '+String(s%60).padStart(2,'0')+'m'};
function openDaily(){
  show('daily');renderDaily();clearInterval(dailyTimer);
  dailyTimer=setInterval(()=>{if(cur()!='daily'){clearInterval(dailyTimer);return}renderDaily()},30000);   // also notices midnight
}
function renderDaily(){
  const t=today();PG.rollDay(P,t);shownDay=PG.dayKey(t);
  const sv=saved(),prog=sv&&sv.meta.type=='daily'&&sv.meta.day==shownDay?sv.meta.idx:-1,n=PG.doneCount(P),sk=PG.streakNow(P,t);
  let info='<b>'+PG.dayLabel(t)+'</b><br>'+n+' of 5 done · 🔥 Streak '+sk+(sk==1?' day':' days')+(P.bestStreak>sk?' (best '+P.bestStreak+')':'');
  if(n==5){const d=PG.dailyScore(P);info+='<br>Score '+fmt(d.score)+(d.hints?' ('+d.hints+(d.hints==1?' hint':' hints')+' = +'+fmt(d.hints*PG.HINT_PENALTY_MS)+')':'')}
  info+='<br>'+(n==5?'All five done. New puzzles in ':'New puzzles in ')+countdown();
  $('#dinfo').innerHTML=info;
  const list=$('#dlist');list.innerHTML='';
  for(let k=0;k<5;k++){
    const P0=K.dailyProfile(k),rec=P.daily.done[k],b=document.createElement('button');
    b.className='drow'+(rec?' done':'')+(prog==k?' prog':'');
    b.innerHTML='<span class="no">'+(rec?'✓':k+1)+'</span><span class="tx">'+K.DAILY_NAMES[k]+'<small>'+P0.cols+' × '+P0.rows+' grid</small></span><span class="st">'+(rec?fmt(rec.ms)+(rec.h?' · '+rec.h+'💡':''):prog==k?'Resume':'Play')+'</span>';
    b.onclick=()=>playDaily(k);list.append(b);
  }
}
function playDaily(k){
  const key=PG.dayKey(today()),rec=P.daily.done[k],sv=saved();
  const start=()=>rec?ask('Practice this puzzle?','You already solved this one today. A replay is for practice and is not recorded.','Practice',()=>makeDaily(k,true)):makeDaily(k,false);
  if(sv&&sv.meta.type=='daily'&&sv.meta.day==key&&sv.meta.idx==k)return resume(sv);
  if(sv)return ask('Start a new puzzle?','You have '+sv.meta.title+' in progress. Starting this one will discard it.','Discard',()=>{clearSave();start()});
  start();
}
function makeDaily(k,practice){
  const rows=$$('#dlist .drow'),row=rows[k],stx=row&&row.querySelector('.st'),old=stx&&stx.innerHTML,day=today();
  rows.forEach(b=>b.disabled=true);if(stx)stx.textContent='Making...';
  setTimeout(()=>{
    let pz=null;try{pz=K.dailyPuzzle(day,k)}catch(e){console.error(e)}
    rows.forEach(b=>b.disabled=false);if(stx)stx.innerHTML=old;
    if(!pz)return ask('Sorry','Could not make this puzzle. Try again.','OK',()=>{},true);
    newGame(pz,dailyMeta(day,k,practice));
  },30);
}
$('#dboard').onclick=()=>openBoard('daily',PG.dayKey(today()),false);

/* ---------- leaderboards: Daily 5 (one per day) and one per level ---------- */
// Daily score = total time of the five + 30 s per hint.  Level score = time + 30 s per extra attempt + 30 s per hint.  Lowest wins.
let bk={kind:'daily',key:''};           // the board that is open
const bcache={};                         // 'd:20261005' / 'l:12' -> {at, rows, rank}: a board is reused for 3 minutes to keep reads low
const bid=k=>(k.kind=='level'?'l:':'d:')+k.key;
const myEntry=k=>{
  if(k.kind=='level'){const b=P.best[k.key];return b?{score:PG.levelScore(b),hints:b.h,attempts:b.a,ms:b.ms}:null}
  return PG.doneCount(P)==5?PG.dailyScore(P):null;
};
function renderBoard(data,msg){
  const list=$('#blist');list.innerHTML='';const u=mp.me(),mine=myEntry(bk),lvl=bk.kind=='level';
  const row=(rk,r,me)=>{
    const d=document.createElement('div');d.className='brow'+(me?' me':'');
    const a=document.createElement('span');a.className='rk';a.textContent=rk;
    const av=document.createElement('span');av.className='rav';av.textContent=r.av||'🙂';
    const n=document.createElement('span');n.className='nm';n.textContent=r.name||'Player';
    const s=document.createElement('span');s.className='sc2';s.textContent=fmt(r.score);
    const sm=document.createElement('small'),h=r.hints?r.hints+(r.hints==1?' hint':' hints'):'no hints';
    sm.textContent=lvl&&r.attempts?(r.ms?'time '+fmt(r.ms)+' · ':'')+r.attempts+(r.attempts==1?' attempt':' attempts')+' · '+h:h;s.append(sm);
    d.append(a,av,n,s);list.append(d);
  };
  if(data&&data.rows){
    data.rows.forEach((r,i)=>row(i+1,r,!!u&&r.uid==u.uid));
    if(mine&&u&&data.rank>data.rows.length)row('#'+data.rank,{name:'You',av:myAv(),score:mine.score,hints:mine.hints,attempts:mine.attempts,ms:mine.ms},true);
  }
  const parts=[];
  if(msg)parts.push(msg);
  else if(data&&data.rows&&!data.rows.length)parts.push(lvl?'No scores on this level yet. Be the first!':'No scores yet today. Be the first!');
  if(!msg&&!mine)parts.push(lvl?'Clear this level to join its board.':'Finish all five puzzles to join today\'s board. You have '+PG.doneCount(P)+' of 5.');
  else if(!msg&&mine&&!u)parts.push('Sign in or play as a guest to put your score on the board.');
  $('#bmsg').textContent=parts.join(' ');
  $('#bsign').hidden=!!u;
}
async function openBoard(kind,key,force){
  const t=today();PG.rollDay(P,t);bk={kind,key};show('board');
  const lvl=kind=='level';
  $('#btitle').textContent=lvl?'Level '+key+' leaderboard':'Today\'s leaderboard';
  $('#bday').textContent=lvl?'Lowest score wins · time + 30 s per extra attempt or hint':PG.dayLabel(t)+' · lowest score wins';
  if(lvl){const op=PG.levelBoardOp(P,key,Date.now());if(op)queueOp(op,false)}   // makes sure my best for this level is on the board
  const c=bcache[bid(bk)];
  if(!force&&c&&Date.now()-c.at<180000)return renderBoard(c);
  renderBoard(null,'Loading...');
  $('#bref').disabled=true;setTimeout(()=>{$('#bref').disabled=false},8000);
  const mine=myEntry(bk);
  try{
    const rows=lvl?await mp.fetchLevelBoard(key,20):await mp.fetchBoard(key,20),u=mp.me();
    let rank=0;
    if(mine&&u){const i=rows.findIndex(r=>r.uid==u.uid);rank=i>=0?i+1:await(lvl?mp.myLevelRank(key,mine.score):mp.myRank(key,mine.score))}
    const d=bcache[bid({kind,key})]={at:Date.now(),rows,rank};
    if(cur()=='board'&&bid(bk)==bid({kind,key}))renderBoard(d);
  }catch(e){if(cur()=='board')renderBoard(null,'Could not load the leaderboard. Check your connection.')}
}
$('#bref').onclick=()=>openBoard(bk.kind,bk.key,true);
$('#bsign').onclick=()=>show('auth');
$('#lvboard').onclick=()=>openBoard('level',S.lvl,false);
$('#rlb').onclick=()=>{if(!g||g.meta.type!='level')return;const L=g.meta.level;S.lvl=L;leave();openBoard('level',L,false)};

/* ---------- Sync: this phone is the master copy, the account keeps a copy ---------- */
// Playing never waits for the network. A clear is saved on the phone first, queued in kk_out, and sent as ONE batched write
// (the clear record + the summary). Offline, the queue just waits; it is retried when the app opens, comes back to the front
// or the connection returns. Records have fixed ids, so sending one twice is harmless.
const withTimeout=(p,ms=20000)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Object.assign(new Error('timeout'),{code:'timeout'})),ms))]);
function queueOp(op,summary=true){PG.pushOut(st,op);if(summary)needPush=true;flush()}
async function flush(){
  const u=mp.me();
  if(flushing){again=true;return}
  if(!u||recUid!==u.uid)return;                       // only after reconcile, so an old summary never overwrites a newer one
  const ops=PG.readOut(st);if(!ops.length&&!needPush)return;
  flushing=true;
  try{
    const items=ops.filter(o=>o.t=='item');
    if(items.length||needPush){await withTimeout(mp.syncClear({items,summary:PG.summaryOf(P,Date.now())}));PG.dropOut(st,items);needPush=false}
    for(const b of ops.filter(o=>o.t=='board')){await withTimeout(mp.submitBoard(b.day,{...b,name:u.name,av:myAv()}));PG.dropOut(st,[b]);delete bcache['d:'+b.day]}
    for(const l of ops.filter(o=>o.t=='lboard')){await withTimeout(mp.submitLevelBoard(l.level,{...l,name:u.name,av:myAv()}));PG.dropOut(st,[l]);PG.markLevelBoard(P,l.level,l.score);PG.saveProg(st,P);delete bcache['l:'+l.level]}
  }catch(e){
    if(e&&e.code=='permission-denied'){console.error('Firestore rules refused the save:',e);PG.clearOut(st);needPush=false}   // do not retry forever
  }finally{flushing=false;if(again){again=false;setTimeout(flush,0)}}
}
// After sign-in (and at every app start while signed in): read the account's summary (1 read) and combine it with this phone's progress.
async function reconcile(){
  const u=mp.me();if(!u||recBusy)return;recBusy=true;
  try{
    const remote=await mp.loadSummary(),r=PG.reconcile(P,remote,u.uid,u.anon);
    for(const k of Object.keys(P))delete P[k];Object.assign(P,r.prog);
    if(r.replaced){clearSave();PG.clearOut(st)}      // another account's progress must not leak into this one
    PG.rollDay(P,today());PG.saveProg(st,P);
    recUid=u.uid;needPush=r.push;
    renderMe();const sc=cur();if(sc=='home')renderHome();if(sc=='daily')renderDaily();if(sc=='setup')setLv(S.lvl);
    flush();
  }catch(e){/* offline: tried again when the connection returns */}
  finally{recBusy=false}
}
const resync=()=>{if(mp.me())recUid===mp.me().uid?flush():reconcile()};
addEventListener('online',resync);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState=='visible')resync()});
setInterval(resync,60000);

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
  if(!g)return;
  if(g.st=='done'){clearSave();return}
  if(g.moves>0||g.counted)PG.writeSave(st,g,elapsed());
}
// an attempt is counted when the first digit (or hint) goes on a fresh board
const attKey=m=>m.type=='level'?'L'+m.level:m.practice?null:'D'+m.day+'-'+m.idx;   // practice replays are not counted
function countAttempt(){
  const k=attKey(g.meta);
  if(g.counted||!k)return;
  g.counted=true;PG.startAttempt(P,k);PG.saveProg(st,P);
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
  recordFinish();   // saved now, so closing the app during the animation loses nothing
  if(!reduced){let n=0;g.els.forEach(k=>{if(k.classList.contains('w')){k.style.setProperty('--k',n++);k.classList.add('done')}})}
  sfx.win();ctx.t1=setTimeout(showResult,reduced?200:1100);
}
// save the clear on the phone, then queue it for the account
function recordFinish(){
  const m=g.meta,now=Date.now();
  if(m.type=='level'){
    const r=g.rec=PG.recordClear(P,{level:m.level,ms:g.ms,hints:g.hints});
    PG.saveProg(st,P);
    if(r.best&&(r.first||r.newBest)){queueOp(PG.levelItem(m.level,r.best,now));const lb=PG.levelBoardOp(P,m.level,now);if(lb)queueOp(lb,false)}
  }else if(m.practice)g.rec={practice:true};
  else if(m.day!==PG.dayKey(today()))g.rec={stale:true};   // the day changed while playing, so it does not count
  else{
    const r=g.rec=PG.recordDaily(P,{today:today(),idx:m.idx,ms:g.ms,hints:g.hints});
    PG.saveProg(st,P);
    if(!r.dup){
      queueOp(PG.dailyItem(m.day,m.idx,P.daily.done[m.idx],now));
      if(r.full)queueOp({t:'board',day:m.day,ms:r.ms,hints:r.hints,score:r.score,finished:now});
    }
  }
}
function showResult(){
  if(!g||g.st!='done'||!g.rec)return;
  const r=g.rec,m=g.meta,list=$('#rlist');list.innerHTML='';let rows,note='';
  const hintTxt=g.hints+' of '+g.hintMax;
  $('#rlb').hidden=m.type!='level';
  if(m.type=='level'){
    $('#rtitle').textContent=m.title+(r.first?' cleared!':' solved!');
    rows=[['⏱','Time',fmt(g.ms)],['🎯','Score',fmt(r.score)],['🏆','Best score',fmt(PG.levelScore(r.best))+(r.newBest&&!r.first?'  new!':'')],['💡','Hints used',hintTxt],['🔁','Attempts',String(r.attempts)]];
    note=(r.score>g.ms?'Score = time + 30 s per extra attempt and per hint. ':'')+(r.first?'Level '+PG.unlockedLevel(P)+' is unlocked.':'');
    $('#rnext').textContent='Next level';
  }else if(r.practice||r.stale||r.dup){
    $('#rtitle').textContent=m.title.replace(' (practice)','')+' solved!';
    rows=[['⏱','Time',fmt(g.ms)],['💡','Hints used',hintTxt]];
    note=r.stale?'The day changed while you were playing, so this one was not recorded.':'Practice: not recorded.';
    $('#rnext').textContent='Daily 5';
  }else{
    $('#rtitle').textContent=m.title+' done!';
    rows=[['⏱','Time',fmt(g.ms)],['💡','Hints used',hintTxt+(g.hints?'  +'+fmt(g.hints*PG.HINT_PENALTY_MS):'')],['🔁','Attempts',String(r.attempts)],['📅','Today',r.done+' of 5']];
    if(r.full){rows.push(['🏁','Score',fmt(r.score)],['🔥','Streak',r.streak+(r.streak==1?' day':' days')]);note='All five done! Your score goes on the leaderboard.'}
    $('#rnext').textContent=r.full?'Leaderboard':'Next puzzle';
  }
  rows.forEach(([ic,nm,val],i)=>{
    const row=document.createElement('div');row.className='rrow'+(i==0?' r0':'');
    const av=document.createElement('span');av.className='rav';av.textContent=ic;
    const n=document.createElement('span');n.className='nm';n.textContent=nm;
    const t=document.createElement('span');t.textContent=val;
    row.append(av,n,t);list.append(row);
  });
  if(note)list.append(Object.assign(document.createElement('p'),{className:'hint',textContent:note}));
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
$('#rnext').onclick=()=>{
  if(!g)return;const mt=g.meta,r=g.rec||{};
  if(mt.type=='level')return makeLevel(mt.level+1,$('#rnext'));
  if(r.full){leave();return openBoard('daily',PG.dayKey(today()),false)}
  if(!r.practice&&!r.stale&&!r.dup){      // next puzzle not solved yet today
    for(let i=1;i<=5;i++){const k=(mt.idx+i)%5;if(!P.daily.done[k]){leave();show('daily');renderDaily();return playDaily(k)}}
  }
  leave();openDaily();
};
$('#rreplay').onclick=()=>{if(!g)return;const pz=g.pz,meta=g.meta.type=='daily'?dailyMeta(PG.dayNum(Date.now()),g.meta.idx,true):g.meta;$('#result').hidden=true;newGame(pz,meta)};   // a replay of a daily is practice
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
  if(cur()=='board'){if(bk.kind=='level'){show('setup');return setLv(S.lvl)}return openDaily()}
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
    if(!r)return;
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
  if(!['home','how','setup','chars','auth','daily','board'].includes(cur())||!$('#result').hidden||!$('#dlg').hidden)return;
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
