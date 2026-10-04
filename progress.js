// Supermania Kakuro: progress and the saved game in progress. Pure functions on a storage-like object
// ({getItem,setItem,removeItem}), so they can be tested in Node. No DOM here.
// Keys: kk_prog (progress summary) and kk_save (the one game in progress).
export const KEYS={prog:'kk_prog',save:'kk_save'};
const isObj=x=>x&&typeof x=='object'&&!Array.isArray(x);
const isInt=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;

/* ---------- progress ---------- */
// cleared = highest level cleared (the next one, cleared+1, is the only new level that can be played)
// best[level] = {ms, a: attempts, h: hints} of the BEST clear (fastest time)
// att["L12"] = attempts started on a puzzle that is not cleared yet (see startAttempt)
export const emptyProg=()=>({v:1,cleared:0,best:{},att:{}});
export function loadProg(st){
  try{
    const p=JSON.parse(st.getItem(KEYS.prog));
    if(isObj(p)&&isInt(p.cleared,0,1e6)&&isObj(p.best)){
      const q=emptyProg();q.cleared=p.cleared;
      for(const k in p.best){const b=p.best[k];if(/^\d+$/.test(k)&&+k<=q.cleared&&isObj(b)&&b.ms>0)q.best[k]={ms:Math.round(b.ms),a:b.a>=1?b.a|0:1,h:b.h>=0?b.h|0:0}}
      if(isObj(p.att))for(const k in p.att)if(/^[LD][\w-]{1,20}$/.test(k)&&p.att[k]>=1)q.att[k]=p.att[k]|0;
      return q;
    }
  }catch{}
  return emptyProg();
}
export const saveProg=(st,p)=>{try{st.setItem(KEYS.prog,JSON.stringify(p));return true}catch{return false}};
export const unlockedLevel=p=>p.cleared+1;
// An ATTEMPT starts when the first digit (or hint) is placed on a fresh board. Resuming a saved game continues the same attempt.
export function startAttempt(p,key){p.att[key]=(p.att[key]||0)+1;return p.att[key]}
// Called once when a level is solved. Returns what the result screen shows.
export function recordClear(p,{level,ms,hints}){
  if(!(level>=1&&level<=p.cleared+1))return{first:false,newBest:false,attempts:1,best:null};   // a locked level can not be cleared
  const key='L'+level,attempts=Math.max(1,p.att[key]||0),prev=p.best[level];
  const first=level===p.cleared+1;
  if(first)p.cleared=level;
  const newBest=!prev||ms<prev.ms;
  if(newBest)p.best[level]={ms:Math.round(ms),a:attempts,h:hints};
  delete p.att[key];
  return{first,newBest,attempts,best:p.best[level]};
}
export function stats(p){
  const v=Object.values(p.best).map(b=>b.ms);
  return{cleared:p.cleared,n:v.length,fastest:v.length?Math.min(...v):0,avg:v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):0};
}

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
    if(m.type!=='level'||!isInt(m.level,1,1e6)||typeof m.title!=='string')return null;
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
