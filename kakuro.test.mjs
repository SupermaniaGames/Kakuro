// Node tests for the Kakuro engine.  Usage: node tests/kakuro.test.mjs FROM TO   (levels FROM..TO)  [--naive-max=W]
import * as K from '../kakuro.js';
import {createHash} from 'node:crypto';
const [FROM,TO]=[+process.argv[2]||1,+process.argv[3]||200];
let fails=0;const bad=(m)=>{fails++;if(fails<=25)console.log('FAIL',m)};
const eq=(a,b,m)=>{if(a!==b)bad(m+' (got '+a+', want '+b+')')};

/* 1. tables */
if(FROM==1){
  const u=n=>K.COMBOS[n].map((l,s)=>l.length==1?s:0).filter(Boolean);
  eq(JSON.stringify(u(2)),'[3,4,16,17]','unique sums for 2 cells');
  eq(JSON.stringify(u(3)),'[6,7,23,24]','unique sums for 3 cells');
  eq(K.COMBOS[2][10].length,4,'10 in two cells has 4 ways');
  eq(K.COMBOS[9][45].length,1,'45 in nine cells');
  eq(K.isGiveaway(2,16),true,'16/2 give-away');eq(K.isGiveaway(2,10),false,'10/2 is not');
  // hand-made 2x2: rows 4 and 6, columns 3 and 7 -> 1 3 / 2 4, unique
  const mk=(a,d)=>({rows:3,cols:3,t:[0,0,0,0,1,1,0,1,1],a:[0,0,0,a[0],0,0,a[1],0,0],d:[0,d[0],d[1],0,0,0,0,0,0]});
  const one=K.solveCount(K.buildModel(mk([4,6],[3,7])));eq(one.count,1,'hand puzzle unique');eq(one.sols[0].join(''),'1324','hand puzzle solution');
  const two=K.solveCount(K.buildModel(mk([3,3],[3,3])));eq(two.count,2,'3/3/3/3 has two solutions');
  const none=K.solveCount(K.buildModel(mk([3,3],[4,4])));eq(none.count,0,'impossible puzzle has none');
}

/* independent brute-force solver (no propagation, no combo tables) for small puzzles */
function naiveCount(pz,limit=2){
  const R=pz.rows,C=pz.cols,N=R*C,v=new Array(N).fill(0),cells=[];
  for(let i=0;i<N;i++)if(pz.t[i])cells.push(i);
  const runs=[];
  for(let i=0;i<N;i++)if(!pz.t[i]){
    if(pz.a[i]){const cs=[];for(let j=i+1;j<N&&pz.t[j]&&(j%C!=0);j++)cs.push(j);runs.push({cs,s:pz.a[i]})}
    if(pz.d[i]){const cs=[];for(let j=i+C;j<N&&pz.t[j];j+=C)cs.push(j);runs.push({cs,s:pz.d[i]})}
  }
  const of=new Map();cells.forEach(i=>of.set(i,[]));runs.forEach(r=>r.cs.forEach(i=>of.get(i).push(r)));
  let count=0;
  const ok=(i)=>{for(const r of of.get(i)){let s=0,full=true,seen=0;for(const j of r.cs){const d=v[j];if(!d){full=false;continue}if(seen>>d&1)return false;seen|=1<<d;s+=d}
    if(s>r.s)return false;if(full&&s!==r.s)return false}return true};
  const go=k=>{if(count>=limit)return;if(k==cells.length){count++;return}
    const i=cells[k];for(let d=1;d<=9;d++){v[i]=d;if(ok(i))go(k+1);v[i]=0}};
  go(0);return count;
}

/* 2. generated puzzles */
const bands={};let fp=createHash('sha1'),n=0,naiveRun=0,inWin=0;
const levels=[];for(let N=FROM;N<=TO;N++)levels.push(N);
for(const N of levels){
  const P=K.levelProfile(N),t0=performance.now(),pz=K.levelPuzzle(N),ms=performance.now()-t0;
  if(!pz){bad('level '+N+' produced no puzzle');continue}
  n++;const R=pz.rows,C=pz.cols,tag=P.rows+'x'+P.cols,B=bands[tag]||(bands[tag]={n:0,ms:[],tiers:[0,0,0,0,0,0],win:0,give:0,runs:0,whites:0});
  B.n++;B.ms.push(ms);B.tiers[pz.info.tier]++;B.give+=pz.info.give;B.runs+=pz.info.runs;B.whites+=pz.info.whites;
  if(pz.info.off==0){B.win++;inWin++}
  eq(pz.rows,P.rows,'rows L'+N);eq(pz.cols,P.cols,'cols L'+N);
  // structure
  for(let c=0;c<C;c++)if(pz.t[c])bad('top row not black L'+N);
  for(let r=0;r<R;r++)if(pz.t[r*C])bad('left column not black L'+N);
  const ur=K.uiRuns(pz),sol=Array.from(pz.sol,Number);
  for(let i=0;i<R*C;i++){
    if(pz.t[i]){if(ur.ra[i]<0||ur.rd[i]<0)bad('white cell without two runs L'+N+' cell '+i);if(sol[i]<1||sol[i]>9)bad('bad digit L'+N)}
    else if(sol[i]!==0)bad('digit in black cell L'+N);
  }
  for(const r of ur.runs){
    if(r.cells.length<2||r.cells.length>P.maxRun)bad('run length '+r.cells.length+' L'+N);
    let s=0,seen=0;for(const i of r.cells){s+=sol[i];if(seen>>sol[i]&1)bad('repeat in run L'+N);seen|=1<<sol[i]}
    eq(s,r.sum,'clue equals sum of solution L'+N);
  }
  // a clue exists exactly where a run starts
  const clues=pz.a.filter(x=>x).length+pz.d.filter(x=>x).length;eq(clues,ur.runs.length,'clue count L'+N);
  if(!K.isSolved(pz,ur.runs,sol))bad('isSolved false on the solution L'+N);
  // exactly one solution, and it is the stored one
  const M=K.buildModel(pz),res=K.solveCount(M,2);
  eq(res.count,1,'solution count L'+N);
  if(res.count==1)eq(res.sols[0].map((d)=>d).join(''),M.gi.map(i=>sol[i]).join(''),'solver solution = stored solution L'+N);
  // independent check on small puzzles
  if(M.W<=16){naiveRun++;eq(naiveCount(pz,2),1,'naive solver count L'+N)}
  // determinism
  if(N%25==0){const again=K.levelPuzzle(N);eq(JSON.stringify(again),JSON.stringify(pz),'same level twice L'+N)}
  fp.update(pz.rows+','+pz.cols+','+pz.t.join('')+pz.a.join(',')+pz.d.join(',')+pz.sol+';');
}
const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
console.log('levels',FROM+'..'+TO,'checked',n,'naive cross-checks',naiveRun,'in target window',inWin+'/'+n,'FAILS',fails);
console.log('size   n    mean   p95    max   (ms, Node)   tiers 1/2/3/4   give-aways/run  whites  in-window');
for(const [tag,B] of Object.entries(bands).sort((a,b)=>parseInt(a[0])*100+parseInt(a[0].split('x')[1])-parseInt(b[0])*100-parseInt(b[0].split('x')[1]))){
  const mean=B.ms.reduce((a,b)=>a+b,0)/B.n;
  console.log(tag.padEnd(6),String(B.n).padStart(4),mean.toFixed(0).padStart(6),q(B.ms,.95).toFixed(0).padStart(6),Math.max(...B.ms).toFixed(0).padStart(6),'      ',B.tiers.slice(1,5).join('/').padEnd(14),(B.give/B.runs).toFixed(2).padStart(6),(B.whites/B.n).toFixed(0).padStart(10),(B.win/B.n*100).toFixed(0).padStart(8)+'%');
}
console.log('fingerprint',fp.digest('hex').slice(0,16));
process.exit(fails?1:0);
