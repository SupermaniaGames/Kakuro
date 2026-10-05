// Supermania Kakuro: progress and the saved game in progress. Pure functions on a storage-like object
// ({getItem,setItem,removeItem}), so they can be tested in Node. No DOM here.
// Keys: kk_prog (progress summary) and kk_save (the one game in progress).
export const KEYS={prog:'kk_prog',save:'kk_save',out:'kk_out'};
const isObj=x=>x&&typeof x=='object'&&!Array.isArray(x);
const isInt=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;

/* ---------- progress ---------- */
// cleared = highest level cleared (the next one, cleared+1, is the only new level that can be played)
// best[level] = {ms, a: attempts, h: hints} of the BEST clear (fastest time)
// att["L12"] / att["D20261005-3"] = attempts started on a puzzle that is not cleared yet (see startAttempt)
// daily = {day:'YYYYMMDD' (India day), done:{'0'..'4': {ms,a,h}}}: today's FIRST clears (replays are practice and not recorded)
// streak / bestStreak / lastFull(day number) / fullDays = days on which all five dailies were finished
// own / ownAnon = which account this device's progress belongs to; sub = last day sent to the daily leaderboard
// lbs[level] = the score last sent to that level's leaderboard (so a level is only sent again when it improves)
export const HINT_PENALTY_MS=30000;   // daily score = total time + 30 s per hint
export const ATTEMPT_PENALTY_MS=30000;   // level score = time + 30 s per extra attempt + 30 s per hint (lowest wins)
export const levelScore=b=>b.ms+(Math.max(1,b.a)-1)*ATTEMPT_PENALTY_MS+b.h*HINT_PENALTY_MS;
export const emptyProg=()=>({v:2,cleared:0,best:{},att:{},daily:{day:'',done:{}},streak:0,bestStreak:0,lastFull:0,fullDays:0,own:'',ownAnon:false,sub:'',lbs:{}});
const normRec=b=>isObj(b)&&b.ms>0&&b.ms<864e5?{ms:Math.round(b.ms),a:b.a>=1&&b.a<=1e4?b.a|0:1,h:b.h>=0&&b.h<=9?b.h|0:0}:null;
// turn anything (storage, a server document) into a clean progress object, or null
export function normProg(p){
  if(!isObj(p)||!isInt(p.cleared,0,1e6)||!isObj(p.best))return null;
  const q=emptyProg();q.cleared=p.cleared;
  for(const k in p.best){const r=normRec(p.best[k]);if(/^\d+$/.test(k)&&+k>=1&&+k<=q.cleared&&r)q.best[k]=r}
  if(isObj(p.att))for(const k in p.att)if(/^(L\d{1,6}|D\d{8}-[0-4])$/.test(k)&&p.att[k]>=1&&p.att[k]<=1e4)q.att[k]=p.att[k]|0;
  if(isObj(p.daily)&&/^\d{8}$/.test(p.daily.day)&&isObj(p.daily.done)){
    q.daily.day=p.daily.day;
    for(const k in p.daily.done){const r=normRec(p.daily.done[k]);if(/^[0-4]$/.test(k)&&r)q.daily.done[k]=r}
  }
  for(const k of ['streak','bestStreak','fullDays'])if(isInt(p[k],0,1e5))q[k]=p[k];
  if(isInt(p.lastFull,0,1e6))q.lastFull=p.lastFull;
  if(typeof p.own==='string'&&/^[\w-]{0,64}$/.test(p.own))q.own=p.own;
  q.ownAnon=p.ownAnon===true;
  if(typeof p.sub==='string'&&/^(\d{8})?$/.test(p.sub))q.sub=p.sub;
  if(isObj(p.lbs))for(const k in p.lbs)if(/^\d{1,6}$/.test(k)&&isInt(p.lbs[k],1,5e8))q.lbs[k]=p.lbs[k];
  return q;
}
export function loadProg(st){
  try{const q=normProg(JSON.parse(st.getItem(KEYS.prog)));if(q)return q}catch{}
  return emptyProg();
}
export const saveProg=(st,p)=>{try{st.setItem(KEYS.prog,JSON.stringify(p));return true}catch{return false}};
export const unlockedLevel=p=>p.cleared+1;
// An ATTEMPT starts when the first digit (or hint) is placed on a fresh board. Resuming a saved game continues the same attempt.
export function startAttempt(p,key){p.att[key]=(p.att[key]||0)+1;return p.att[key]}
// Called once when a level is solved. Returns what the result screen shows.
export function recordClear(p,{level,ms,hints}){
  if(!(level>=1&&level<=p.cleared+1))return{first:false,newBest:false,attempts:1,score:0,best:null};   // a locked level can not be cleared
  const key='L'+level,attempts=Math.max(1,p.att[key]||0),prev=p.best[level];
  const first=level===p.cleared+1;
  if(first)p.cleared=level;
  const rec={ms:Math.round(ms),a:attempts,h:hints};
  const newBest=!prev||levelScore(rec)<levelScore(prev);   // best = lowest score (time + penalties), not just fastest time
  if(newBest)p.best[level]=rec;
  delete p.att[key];
  return{first,newBest,attempts,score:levelScore(rec),best:p.best[level]};
}
export function stats(p){
  const v=Object.values(p.best).map(b=>b.ms);
  return{cleared:p.cleared,n:v.length,fastest:v.length?Math.min(...v):0,avg:v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0};
}

/* ---------- Daily 5: India days ---------- */
const IST=19800000,DAY=86400000,WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const dayNum=ms=>Math.floor((ms+IST)/DAY);                 // whole days since 1970-01-01 in India time
export const dayKey=n=>new Date(n*DAY).toISOString().slice(0,10).replace(/-/g,'');
export const dayLabel=n=>{const d=new Date(n*DAY);return WD[d.getUTCDay()]+' '+d.getUTCDate()+' '+MO[d.getUTCMonth()]};
export const msToNextDay=now=>(dayNum(now)+1)*DAY-IST-now;
// make p.daily belong to today (a new day starts with nothing done) and forget attempt counters of other days
export function rollDay(p,today){
  const key=dayKey(today);
  if(p.daily.day!==key)p.daily={day:key,done:{}};
  for(const k of Object.keys(p.att))if(k[0]==='D'&&!k.startsWith('D'+key+'-'))delete p.att[k];
}
export const doneCount=p=>Object.keys(p.daily.done).length;
export const streakNow=(p,today)=>p.lastFull===today||p.lastFull===today-1?p.streak:0;   // yesterday still counts until midnight passes
export function dailyScore(p){let ms=0,h=0;for(const k in p.daily.done){ms+=p.daily.done[k].ms;h+=p.daily.done[k].h}return{ms,hints:h,score:ms+h*HINT_PENALTY_MS}}
// Called once when a daily puzzle is solved for the first time that day.
export function recordDaily(p,{today,idx,ms,hints}){
  rollDay(p,today);
  if(!(idx>=0&&idx<=4)||p.daily.done[idx])return{dup:true};
  const key='D'+dayKey(today)+'-'+idx,attempts=Math.max(1,p.att[key]||0);
  p.daily.done[idx]={ms:Math.round(ms),a:attempts,h:hints};delete p.att[key];
  const n=doneCount(p),full=n===5;
  if(full){p.streak=p.lastFull===today-1?p.streak+1:1;p.bestStreak=Math.max(p.bestStreak,p.streak);p.lastFull=today;p.fullDays++}
  return{dup:false,attempts,done:n,full,streak:full?p.streak:streakNow(p,today),...dailyScore(p)};
}

/* ---------- sync with the account ---------- */
// What is stored in kakuroProgress/{uid}: everything in progress that belongs to the account, plus summary numbers for the home screen.
export function summaryOf(p,now){
  const s=stats(p);
  return{cleared:p.cleared,best:p.best,daily:p.daily,streak:p.streak,bestStreak:p.bestStreak,lastFull:p.lastFull,fullDays:p.fullDays,fastest:s.fastest,avg:s.avg,n:s.n,updated:now||0};
}
const core=s=>{const o={...s};delete o.updated;return JSON.stringify(o)};
export const sameSummary=(p,remote)=>{const r=normProg(remote);return !!r&&core(summaryOf(p))===core(summaryOf(r))};
// Merge two progress objects (a = this phone, b = the account). Never loses anything: highest level, fastest times, newest day, longest streak.
export function mergeProg(a,b){
  const r=emptyProg();
  r.cleared=Math.max(a.cleared,b.cleared);
  for(const src of [b,a])for(const k in src.best){const x=src.best[k],y=r.best[k];if(+k<=r.cleared&&(!y||levelScore(x)<levelScore(y)||(levelScore(x)===levelScore(y)&&src===a)))r.best[k]={...x}}
  r.att={...a.att};
  if(a.daily.day===b.daily.day){r.daily={day:a.daily.day,done:{}};for(const src of [b,a])for(const k in src.daily.done){const x=src.daily.done[k],y=r.daily.done[k];if(!y||x.ms<y.ms)r.daily.done[k]={...x}}}
  else r.daily=JSON.parse(JSON.stringify(a.daily.day>b.daily.day?a.daily:b.daily));
  const w=a.lastFull>b.lastFull||(a.lastFull===b.lastFull&&a.streak>=b.streak)?a:b;
  r.streak=w.streak;r.lastFull=w.lastFull;r.bestStreak=Math.max(a.bestStreak,b.bestStreak,r.streak);r.fullDays=Math.max(a.fullDays,b.fullDays);
  r.sub=a.sub>b.sub?a.sub:b.sub;r.own=a.own;r.ownAnon=a.ownAnon;r.lbs={...a.lbs};
  return r;
}
// Called after sign-in with the account's stored summary (or null). Decides how this phone's progress and the account's combine:
//  - this phone's progress is new, or came from a guest, or belongs to this account  -> merge both (a guest's progress moves into the account)
//  - it belongs to a DIFFERENT real account                                         -> the account's own progress replaces it
// push = the account's stored copy is missing something and must be written.
export function reconcile(local,remote,uid,anon){
  const rem=normProg(remote)||emptyProg();
  const adopt=!local.own||local.ownAnon||local.own===uid;
  const prog=adopt?mergeProg(local,rem):rem;
  prog.own=uid;prog.ownAnon=!!anon;
  const empty=!prog.cleared&&!doneCount(prog)&&!prog.fullDays;
  return{prog,replaced:!adopt,push:remote?!sameSummary(prog,remote):!empty};
}

/* ---------- outbox: clears waiting to reach the server ---------- */
// Items are idempotent (fixed document ids), so sending one twice is harmless. An op is removed only after the server confirmed it.
const okMs=x=>isInt(x,1,5e8);
function okOp(o){
  if(!isObj(o))return false;
  if(o.t==='item')return /^(L\d{1,6}|D\d{8}-[0-4])$/.test(o.pid)&&isObj(o.data)&&['level','daily'].includes(o.data.kind)&&okMs(o.data.ms)&&isInt(o.data.attempts,1,1e4)&&isInt(o.data.hints,0,9)&&Number.isFinite(o.data.finished);
  if(o.t==='lboard')return isInt(o.level,1,1e6)&&okMs(o.ms)&&okMs(o.score)&&isInt(o.attempts,1,1e4)&&isInt(o.hints,0,9)&&Number.isFinite(o.finished);
  if(o.t==='board')return /^\d{8}$/.test(o.day)&&okMs(o.ms)&&okMs(o.score)&&isInt(o.hints,0,45)&&Number.isFinite(o.finished);
  return false;
}
const opId=o=>o.t==='item'?o.pid:o.t==='lboard'?'LB'+o.level:'B'+o.day;
export function readOut(st){try{const a=JSON.parse(st.getItem(KEYS.out));return Array.isArray(a)?a.filter(okOp).slice(-300):[]}catch{return[]}}
const writeOut=(st,a)=>{try{if(a.length)st.setItem(KEYS.out,JSON.stringify(a));else st.removeItem(KEYS.out)}catch{}};
export function pushOut(st,op){const a=readOut(st).filter(x=>opId(x)!==opId(op));a.push(op);writeOut(st,a)}
export function dropOut(st,ops){const ids=new Set(ops.map(opId));writeOut(st,readOut(st).filter(x=>!ids.has(opId(x))))}
export const clearOut=st=>{try{st.removeItem(KEYS.out)}catch{}};
export const levelItem=(level,rec,finished)=>({t:'item',pid:'L'+level,data:{kind:'level',level,ms:rec.ms,attempts:rec.a,hints:rec.h,finished}});
export const dailyItem=(day,idx,rec,finished)=>({t:'item',pid:'D'+day+'-'+idx,data:{kind:'daily',day,idx,ms:rec.ms,attempts:rec.a,hints:rec.h,finished}});

/* ---------- saved game ---------- */
// The puzzle itself is stored, so resuming never regenerates it (and keeps working if the generator changes later).
export function packSave(g,ms){
  return{v:1,meta:g.meta,pz:{v:g.pz.v,seed:g.pz.seed,rows:g.pz.rows,cols:g.pz.cols,t:g.pz.t,a:g.pz.a,d:g.pz.d,sol:g.pz.sol},
    cells:Array.from(g.v).join(''),n:Array.from(g.n),lock:Array.from(g.lock).join(''),
    hints:g.hints,hintMax:g.hintMax,checks:g.checks,ms:Math.round(ms),moves:g.moves,counted:!!g.counted,pencil:!!g.pencil,
    hist:g.hist.slice(-100)};
}
export function writeSave(st,g,ms){try{st.setItem(KEYS.save,JSON.stringify(packSave(g,ms)));return true}catch{return false}}
export const clearSave=st=>{try{st.removeItem(KEYS.save)}catch{}};
// Returns a checked save object, or null if it is missing or damaged. Nothing from storage is trusted.
export function readSave(st){
  try{
    const raw=st.getItem(KEYS.save);if(!raw)return null;
    const s=JSON.parse(raw);if(!isObj(s)||s.v!==1||!isObj(s.meta)||!isObj(s.pz))return null;
    const m=s.meta,z=s.pz,R=z.rows,C=z.cols;
    if(typeof m.title!=='string'||m.title.length>40)return null;
    if(m.type==='level'){if(!isInt(m.level,1,1e6))return null}
    else if(m.type==='daily'){if(!/^\d{8}$/.test(m.day)||!isInt(m.idx,0,4)||(m.practice!==undefined&&typeof m.practice!=='boolean'))return null}
    else return null;
    if(!isInt(R,4,16)||!isInt(C,4,16))return null;
    const N=R*C;
    if(!Array.isArray(z.t)||z.t.length!==N||!Array.isArray(z.a)||z.a.length!==N||!Array.isArray(z.d)||z.d.length!==N)return null;
    if(!z.t.every(x=>x===0||x===1)||!z.a.every(x=>isInt(x,0,45))||!z.d.every(x=>isInt(x,0,45)))return null;
    if(typeof z.sol!=='string'||!new RegExp('^[0-9]{'+N+'}$').test(z.sol))return null;
    if(typeof s.cells!=='string'||!new RegExp('^[0-9]{'+N+'}$').test(s.cells))return null;
    if(typeof s.lock!=='string'||!new RegExp('^[01]{'+N+'}$').test(s.lock))return null;
    if(!Array.isArray(s.n)||s.n.length!==N||!s.n.every(x=>isInt(x,0,511)))return null;
    for(let i=0;i<N;i++)if(!z.t[i]&&(s.cells[i]!=='0'||s.n[i]||s.lock[i]!=='0'||z.sol[i]!=='0'))return null;
    if(!isInt(s.hints,0,9)||!isInt(s.hintMax,1,9)||s.hints>s.hintMax||!isInt(s.checks,0,1e4)||!isInt(s.ms,0,864e5*30)||!isInt(s.moves,0,1e7))return null;
    if(!Array.isArray(s.hist)||s.hist.length>100)return null;
    for(const ch of s.hist){
      if(!Array.isArray(ch)||ch.length<1||ch.length>20)return null;
      for(const c of ch)if(!isObj(c)||!isInt(c.i,0,N-1)||!z.t[c.i]||!isInt(c.v0,0,9)||!isInt(c.v1,0,9)||!isInt(c.n0,0,511)||!isInt(c.n1,0,511))return null;
    }
    return s;
  }catch{return null}
}
// Level leaderboard: queue this level's best score if the board has not seen it yet (new best, or never sent). Returns true if queued.
export function levelBoardOp(p,level,finished){
  const b=p.best[level];if(!b)return null;
  const score=levelScore(b);if(p.lbs[level]&&p.lbs[level]<=score)return null;
  return{t:'lboard',level,ms:b.ms,attempts:b.a,hints:b.h,score,finished};
}
// the server confirmed a level entry
export const markLevelBoard=(p,level,score)=>{p.lbs[level]=score};
