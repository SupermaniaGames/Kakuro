// Supermania Kakuro engine: seeded generator, solver, difficulty rater and level curve.
// Pure functions. No DOM, no Math.random, no clocks, no Math.exp/log/pow: the same seed gives the same
// puzzle on every phone. Changing ANY generation rule changes every level, so bump GEN_VERSION if you do.
export const GEN_VERSION=1;

/* ---------- tables ---------- */
// A set of digits is a 9-bit mask: bit (d-1) is digit d.
const PC=new Uint8Array(512),SUMD=new Uint8Array(512);
for(let m=1;m<512;m++){let c=0,s=0;for(let d=0;d<9;d++)if(m>>d&1){c++;s+=d+1}PC[m]=c;SUMD[m]=s}
// COMBOS[n][s] = every set of n different digits that adds up to s
export const COMBOS=Array.from({length:10},()=>Array.from({length:46},()=>[]));
for(let m=1;m<512;m++)COMBOS[PC[m]][SUMD[m]].push(m);
// UNIQ[n] = digit sets that are the ONLY way to make their sum with n cells ("give-aways"), n = 2..5
const UNIQ=[];for(let n=0;n<=5;n++){UNIQ[n]=[];if(n>=2)for(let m=1;m<512;m++)if(PC[m]==n&&COMBOS[n][SUMD[m]].length==1)UNIQ[n].push(m)}
export const isGiveaway=(n,s)=>n>=2&&n<=5&&COMBOS[n][s]&&COMBOS[n][s].length==1;
const digitOf=b=>32-Math.clz32(b);          // single bit -> digit

/* ---------- seeded random ---------- */
export function hash32(x){x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return(x^(x>>>16))>>>0}
export function makeRng(seed){
  let a=hash32((seed>>>0)^0x4b4b4b4b)|0;
  const f=()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
  f.int=n=>Math.floor(f()*n);
  return f;
}
const shuffle=(rnd,a)=>{for(let i=a.length-1;i>0;i--){const j=rnd.int(i+1),x=a[i];a[i]=a[j];a[j]=x}return a};

/* ---------- layout ---------- */
// Grid is rows x cols INCLUDING the clue row (row 0) and clue column (col 0), which are always black.
// t[i] = 1 for a white entry cell, 0 for black. Index i = r*cols+c.
function scan(t,R,C){
  const N=R*C,hl=new Uint8Array(N),vl=new Uint8Array(N),runs=[];
  for(let r=1;r<R;r++){let c=1;while(c<C){
    if(!t[r*C+c]){c++;continue}
    const s=c;while(c<C&&t[r*C+c])c++;const len=c-s;
    for(let k=s;k<c;k++)hl[r*C+k]=len;
    if(len>=2){const cells=[];for(let k=s;k<c;k++)cells.push(r*C+k);runs.push({dir:0,cells,clue:r*C+s-1})}
  }}
  for(let c=1;c<C;c++){let r=1;while(r<R){
    if(!t[r*C+c]){r++;continue}
    const s=r;while(r<R&&t[r*C+c])r++;const len=r-s;
    for(let k=s;k<r;k++)vl[k*C+c]=len;
    if(len>=2){const cells=[];for(let k=s;k<r;k++)cells.push(k*C+c);runs.push({dir:1,cells,clue:(s-1)*C+c})}
  }}
  return{hl,vl,runs};
}
// keep only the biggest connected block of white cells; returns true if something was removed
function keepBiggest(t,R,C){
  const N=R*C,comp=new Int16Array(N).fill(-1),sizes=[];
  for(let i=0;i<N;i++){
    if(!t[i]||comp[i]>=0)continue;
    const id=sizes.length,st=[i];comp[i]=id;let n=0;
    while(st.length){const x=st.pop();n++;const r=(x/C)|0,c=x%C;
      for(const y of [r>0?x-C:-1,r<R-1?x+C:-1,c>0?x-1:-1,c<C-1?x+1:-1])if(y>=0&&t[y]&&comp[y]<0){comp[y]=id;st.push(y)}}
    sizes.push(n);
  }
  if(sizes.length<=1)return false;
  let best=0;for(let k=1;k<sizes.length;k++)if(sizes[k]>sizes[best])best=k;
  for(let i=0;i<N;i++)if(t[i]&&comp[i]!=best)t[i]=0;
  return true;
}
// length of the white run through cell i, stepping by 1 (across) or C (down)
function runLen(t,C,i,step){let n=1,x=i-step;while(t[x]&&(step!=1||x%C!=C-1)){n++;x-=step}x=i+step;while(t[x]&&(step!=1||x%C!=0)){n++;x+=step}return n}
function makeLayout(rnd,R,C,P){
  const N=R*C,minWhite=Math.floor((R-1)*(C-1)*P.minFill);
  for(let att=0;att<30;att++){
    const t=new Uint8Array(N);
    for(let r=1;r<R;r++)for(let c=1;c<C;c++)t[r*C+c]=rnd()<P.dens?1:0;
    for(let it=0;it<60;it++){
      const s=scan(t,R,C);let ch=false;
      for(let i=0;i<N;i++)if(t[i]&&(s.hl[i]<2||s.vl[i]<2)){t[i]=0;ch=true}
      if(ch)continue;
      for(const run of s.runs){const L=run.cells.length;if(L>P.maxRun){t[run.cells[1+rnd.int(L-2)]]=0;ch=true}}
      if(ch)continue;
      // 2x2 blocks of white cells are where most second solutions come from, so only P.max2x2 of them are kept.
      // A block is broken by a black cell that leaves every neighbouring white cell with a run of 2 or more both ways.
      let did=false;
      for(let guard=0;guard<80;guard++){
        const blocks=[];
        for(let r=1;r<R-1;r++)for(let c=1;c<C-1;c++){const i=r*C+c;if(t[i]&&t[i+1]&&t[i+C]&&t[i+C+1])blocks.push(i)}
        if(blocks.length<=P.max2x2)break;
        const i=blocks[rnd.int(blocks.length)],opts=shuffle(rnd,[i,i+1,i+C,i+C+1]);
        let pick=-1;
        for(const x of opts){t[x]=0;let good=true;
          for(const y of [x-1,x+1,x-C,x+C])if(t[y]&&(runLen(t,C,y,1)<2||runLen(t,C,y,C)<2)){good=false;break}
          t[x]=1;if(good){pick=x;break}}
        if(pick<0)break;
        t[pick]=0;did=true;
      }
      if(did)continue;
      if(keepBiggest(t,R,C))continue;
      break;
    }
    const s=scan(t,R,C);let ok=true,w=0;
    for(let i=0;i<N;i++)if(t[i]){w++;if(s.hl[i]<2||s.vl[i]<2||s.hl[i]>P.maxRun||s.vl[i]>P.maxRun)ok=false}
    if(!ok||w<minWhite)continue;
    let b2=0;for(let r=1;r<R-1;r++)for(let c=1;c<C-1;c++){const i=r*C+c;if(t[i]&&t[i+1]&&t[i+C]&&t[i+C+1])b2++}
    if(b2>P.max2x2)continue;
    // every row and column of the grid must be used, so the grid really is rows x cols
    let rowsOk=true,colsOk=true;
    for(let r=1;r<R&&rowsOk;r++){let any=0;for(let c=1;c<C;c++)any|=t[r*C+c];if(!any)rowsOk=false}
    for(let c=1;c<C&&colsOk;c++){let any=0;for(let r=1;r<R;r++)any|=t[r*C+c];if(!any)colsOk=false}
    if(!rowsOk||!colsOk)continue;
    return t;
  }
  return null;
}

/* ---------- fill: a random full set of digits with no repeat inside any run ---------- */
function makeFill(rnd,t,R,C,runs,dom){
  const N=R*C,ra=new Int16Array(N).fill(-1),rd=new Int16Array(N).fill(-1);
  runs.forEach((r,k)=>r.cells.forEach(i=>{if(r.dir)rd[i]=k;else ra[i]=k}));
  const used=new Uint16Array(runs.length),v=new Int8Array(N),order=[];
  for(let i=0;i<N;i++)if(t[i])order.push(i);
  let nodes=0;
  const go=k=>{
    if(k==order.length)return true;
    if(++nodes>4000)return false;
    const i=order[k];let m=dom[i]&~used[ra[i]]&~used[rd[i]];
    if(!m)return false;
    const ds=[];for(let d=1;d<=9;d++)if(m>>(d-1)&1)ds.push(d);
    shuffle(rnd,ds);
    for(const d of ds){
      const b=1<<(d-1);v[i]=d;used[ra[i]]|=b;used[rd[i]]|=b;
      if(go(k+1))return true;
      v[i]=0;used[ra[i]]&=~b;used[rd[i]]&=~b;
      if(nodes>4000)return false;
    }
    return false;
  };
  return go(0)?v:null;
}
// choose some short runs to be give-aways: restrict their cells to a digit set that is the only way to make its sum
function applyGive(rnd,runs,want,dom,prot){
  const idx=[];runs.forEach((r,k)=>{if(r.cells.length>=2&&r.cells.length<=4)idx.push(k)});
  shuffle(rnd,idx);let got=0;
  for(const k of idx){
    if(got>=want)break;
    const r=runs[k],opts=UNIQ[r.cells.length],m=opts[rnd.int(opts.length)];
    if(r.cells.some(i=>!(dom[i]&m)))continue;   // a cell shared with another give-away run must keep a digit
    r.cells.forEach(i=>{dom[i]&=m;prot[i]=1});got++;
  }
  return got;
}

/* ---------- model + propagation + counting solver ---------- */
// puzzle: {rows,cols,t:[0|1],a:[across clue on black cells],d:[down clue],sol?}
export function buildModel(pz){
  const R=pz.rows,C=pz.cols,N=R*C,wOf=new Int16Array(N).fill(-1),gi=[];
  for(let i=0;i<N;i++)if(pz.t[i]){wOf[i]=gi.length;gi.push(i)}
  const runs=[],cellRuns=gi.map(()=>[]);
  const add=(clue,step,sum,dir)=>{
    const cs=[];let i=clue+step;
    while(i<N&&pz.t[i]&&!(dir==0&&i%C==0)){cs.push(wOf[i]);i+=step}
    const k=runs.length;runs.push({cells:cs,sum,n:cs.length,dir,clue});cs.forEach(w=>cellRuns[w].push(k));
  };
  for(let i=0;i<N;i++){if(!pz.t[i]){if(pz.a[i]>0)add(i,1,pz.a[i],0);if(pz.d[i]>0)add(i,C,pz.d[i],1)}}
  return{W:gi.length,gi,wOf,runs,cellRuns,N};
}
// Narrow candidate masks until nothing changes. Returns false on a contradiction.
// lvl 1: a run's digits are limited to the sets that can make its sum and contain its placed digits; placed digits leave the other cells.
// lvl 2: also drop sets that do not fit what the cells can still be (candidates crossing between runs).
// lvl 3: also "this digit must be in the run, and only one cell can hold it" and naked pairs.
export function propagate(M,cand,lvl){
  const runs=M.runs,cr=M.cellRuns,nR=runs.length,inQ=new Uint8Array(nR),q=[];
  for(let r=nR-1;r>=0;r--){q.push(r);inQ[r]=1}
  const wake=w=>{for(const r of cr[w])if(!inQ[r]){inQ[r]=1;q.push(r)}};
  while(q.length){
    const r=q.pop();inQ[r]=0;
    const run=runs[r],cs=run.cells,n=cs.length;
    let fixed=0,union=0;
    for(let k=0;k<n;k++){const m=cand[cs[k]];if(!m)return false;union|=m;if(!(m&(m-1))){if(fixed&m)return false;fixed|=m}}
    for(let k=0;k<n;k++){const w=cs[k],m=cand[w];
      if(m&(m-1)){const nm=m&~fixed;if(nm!==m){if(!nm)return false;cand[w]=nm;wake(w)}}}
    let allowed=0,must=511,any=false;
    const list=COMBOS[n][run.sum];
    for(let j=0;j<list.length;j++){
      const cm=list[j];
      if((cm&fixed)!==fixed)continue;
      if(lvl>=2){
        if(cm&~union)continue;
        let fit=true;for(let k=0;k<n;k++)if(!(cand[cs[k]]&cm)){fit=false;break}
        if(!fit)continue;
      }
      allowed|=cm;must&=cm;any=true;
    }
    if(!any)return false;
    for(let k=0;k<n;k++){const w=cs[k],m=cand[w],nm=m&allowed;if(!nm)return false;if(nm!==m){cand[w]=nm;wake(w)}}
    if(lvl>=3){
      for(let d=0;d<9;d++){const b=1<<d;if(!(must&b))continue;
        let cnt=0,at=-1;for(let k=0;k<n;k++)if(cand[cs[k]]&b){cnt++;at=cs[k]}
        if(cnt==0)return false;
        if(cnt==1&&cand[at]!==b){cand[at]=b;wake(at)}}
      for(let a=0;a<n;a++){const ma=cand[cs[a]];if(PC[ma]!=2)continue;
        let same=0;for(let k=0;k<n;k++)if(cand[cs[k]]===ma)same++;
        if(same==2)for(let k=0;k<n;k++){const w=cs[k],m=cand[w];if(m!==ma&&(m&ma)){const nm=m&~ma;if(!nm)return false;cand[w]=nm;wake(w)}}
        else if(same>2)return false;}
    }
  }
  return true;
}
const allSingle=(c)=>{for(let i=0;i<c.length;i++){const m=c[i];if(!m||(m&(m-1)))return false}return true};
// count solutions up to `limit` (2 is enough to prove a puzzle is unique). sols[k][w] = digit of white cell w.
export function solveCount(M,limit=2,maxNodes=1e9){
  const sols=[];let count=0,nodes=0,aborted=false;
  const dfs=cand=>{
    if(aborted)return;
    if(++nodes>maxNodes){aborted=true;return}
    if(!propagate(M,cand,3))return;
    let best=-1,bc=10;
    for(let w=0;w<M.W;w++){const p=PC[cand[w]];if(p>1&&p<bc){bc=p;best=w}}
    if(best<0){count++;sols.push(Array.from(cand,digitOf));return}
    let m=cand[best];
    while(m){
      const b=m&-m;m^=b;
      const c2=cand.slice();c2[best]=b;dfs(c2);
      if(count>=limit)return;
    }
  };
  dfs(new Uint16Array(M.W).fill(511));
  return{count,sols,aborted,nodes};
}

/* ---------- rating: how much logic does a human need? ---------- */
// tier 1: give-aways and placed digits only. tier 2: + sets that fit what crossing cells allow.
// tier 3: + must-have digits, hidden singles, naked pairs. tier 4: + one trial-and-contradiction step.
// tier 5: needs deeper guessing (the generator never offers these).
export function rate(M){
  let easy=0;
  for(let lvl=1;lvl<=3;lvl++){
    const c=new Uint16Array(M.W).fill(511);
    if(!propagate(M,c,lvl))return{tier:0,easy:0};
    if(lvl==1){for(let w=0;w<M.W;w++)if(!(c[w]&(c[w]-1)))easy++}
    if(allSingle(c))return{tier:lvl,easy:lvl==1?M.W:easy};
  }
  const c=new Uint16Array(M.W).fill(511);propagate(M,c,3);
  for(let round=0;round<200;round++){
    if(allSingle(c))return{tier:4,easy};
    let progress=false;
    const ws=[];for(let w=0;w<M.W;w++)if(c[w]&(c[w]-1))ws.push(w);
    ws.sort((x,y)=>PC[c[x]]-PC[c[y]]||x-y);
    for(const w of ws){
      let m=c[w];if(!(m&(m-1)))continue;
      while(m){const b=m&-m;m^=b;
        const tr=c.slice();tr[w]=b;
        if(!propagate(M,tr,3)){c[w]&=~b;progress=true;if(!c[w]||!propagate(M,c,3))return{tier:0,easy}}}
      if(progress)break;
    }
    if(!progress)return{tier:5,easy};
  }
  return{tier:5,easy};
}
export function giveCount(M){let g=0;for(const r of M.runs)if(isGiveaway(r.n,r.sum))g++;return g}

/* ---------- difficulty curve ---------- */
// rows x cols of the whole grid (clue row and column included), widest side = cols so it fits a phone.
export const SIZES=[[5,5],[6,5],[6,6],[7,6],[7,7],[8,7],[8,8],[9,8],[9,9],[10,9],[10,10],[11,10],[11,11]];
export const levelD=N=>N/(N+90);   // 0 -> 1, fast at first, then slower and slower, never stops rising
export function profileFor(d){
  const si=Math.min(SIZES.length-1,Math.floor(d*13)),[rows,cols]=SIZES[si];
  const g=0.55-0.42*d;                                    // share of runs that should be give-aways
  const tw=d<.04?[1,1]:d<.12?[1,2]:d<.25?[2,2]:d<.40?[2,3]:[3,4];
  return{d,rows,cols,size:si,dens:.74,minFill:.4,max2x2:Math.ceil((rows-1)*(cols-1)/6),maxRun:Math.min(9,4+Math.floor(d*6.5)),g,gTol:.12,tLo:tw[0],tHi:tw[1],maxAtt:40};
}
export const levelProfile=N=>profileFor(levelD(N));

/* ---------- generator ---------- */
// Repair: while the puzzle has a second solution, change one digit of the hidden fill where the two solutions differ.
// The clues are recomputed from the fill, so the second solution stops adding up. Stops at one solution.
function setClues(pz,runs,v){
  pz.a.fill(0);pz.d.fill(0);
  for(const r of runs){let s=0;for(const i of r.cells)s+=v[i];(r.dir?pz.d:pz.a)[r.clue]=s}
}
function repair(rnd,pz,runs,v,prot,ra,rd){
  for(let rep=0;rep<40;rep++){
    setClues(pz,runs,v);
    const M=buildModel(pz),res=solveCount(M,2,400);
    if(res.aborted)return null;
    if(res.count==1)return M;
    if(res.count==0)return null;
    const alt=res.sols.find(s=>s.some((d,w)=>d!==v[M.gi[w]]));
    const diffs=[];alt.forEach((d,w)=>{if(d!==v[M.gi[w]])diffs.push(M.gi[w])});
    const free=diffs.filter(i=>!prot[i]),pool=free.length?free:diffs,x=pool[rnd.int(pool.length)];
    const old=v[x],altd=alt[M.wOf[x]];
    let used=0;
    for(const r of [runs[ra[x]],runs[rd[x]]])for(const i of r.cells)if(i!==x)used|=1<<(v[i]-1);
    let ds=[];for(let d=1;d<=9;d++)if(d!==old&&!(used>>(d-1)&1))ds.push(d);
    if(!ds.length)return null;
    const pref=ds.filter(d=>d!==altd);if(pref.length)ds=pref;
    v[x]=ds[rnd.int(ds.length)];
  }
  return null;
}
// Returns a puzzle with exactly one solution, or null. Never uses time: it stops after P.maxAtt full attempts.
export function generate(seed,P){
  const rnd=makeRng(seed),R=P.rows,C=P.cols,N=R*C;
  let best=null,bestDist=1e9,att=0,tries=0;
  const hard=P.maxAtt*4;
  for(;tries<hard;tries++){
    if(tries>=P.maxAtt&&best)break;
    const ext=tries<P.maxAtt*.4?0:tries<P.maxAtt*.75?1:2;
    const t=makeLayout(rnd,R,C,P);if(!t)continue;
    const sc=scan(t,R,C),runs=sc.runs;
    const ra=new Int16Array(N).fill(-1),rd=new Int16Array(N).fill(-1);
    runs.forEach((r,k)=>r.cells.forEach(i=>{if(r.dir)rd[i]=k;else ra[i]=k}));
    const dom=new Uint16Array(N).fill(511),prot=new Uint8Array(N);
    const want=Math.max(0,Math.round((P.g+(rnd()-.5)*.2)*runs.length));
    applyGive(rnd,runs,want,dom,prot);
    let v=makeFill(rnd,t,R,C,runs,dom);
    if(!v){v=makeFill(rnd,t,R,C,runs,new Uint16Array(N).fill(511));prot.fill(0)}
    if(!v)continue;
    att++;
    const pz={v:GEN_VERSION,seed,rows:R,cols:C,t:Array.from(t),a:new Array(N).fill(0),d:new Array(N).fill(0)};
    const M=repair(rnd,pz,runs,v,prot,ra,rd);if(!M)continue;
    const rt=rate(M);if(rt.tier<1||rt.tier>4)continue;
    const give=giveCount(M),share=give/M.runs.length;
    const td=rt.tier<P.tLo?P.tLo-rt.tier:rt.tier>P.tHi?rt.tier-P.tHi:0,gd=Math.max(0,Math.abs(share-P.g)-P.gTol*(1+ext));
    const dist=td*1+gd*3;
    if(dist<bestDist){
      bestDist=dist;
      best={...pz,sol:Array.from({length:N},(_,i)=>pz.t[i]?v[i]:0).join(''),info:{tier:rt.tier,give,runs:M.runs.length,whites:M.W,easy:rt.easy,att:tries+1,off:+dist.toFixed(2)}};
    }
    if(td==0&&gd==0)break;
  }
  return best;
}
// Level N uses seed N. In the rare case that seed finds no unique puzzle, a fixed list of follow-up seeds derived from N is tried
// (still no clocks and no Math.random, so every phone ends up with the same puzzle).
export function levelPuzzle(N){
  const P=levelProfile(N);
  for(let k=0;k<6;k++){const pz=generate(k?hash32(N*31+k):N,P);if(pz)return pz}
  return null;
}

/* ---------- helpers the game screen uses ---------- */
// every run with grid indexes, plus which run an entry cell belongs to (ra = across, rd = down)
export function uiRuns(pz){
  const M=buildModel(pz),N=M.N,ra=new Int16Array(N).fill(-1),rd=new Int16Array(N).fill(-1);
  const runs=M.runs.map((r,k)=>{const cells=r.cells.map(w=>M.gi[w]);cells.forEach(i=>{if(r.dir)rd[i]=k;else ra[i]=k});return{dir:r.dir,sum:r.sum,clue:r.clue,cells}});
  return{runs,ra,rd};
}
// a hint: the unfilled or wrong cell that a human could work out next, given the correct digits entered so far
export function hintCell(pz,vals){
  const M=buildModel(pz),c=new Uint16Array(M.W).fill(511);
  for(let w=0;w<M.W;w++){const i=M.gi[w];if(vals[i]&&vals[i]==+pz.sol[i])c[w]=1<<(vals[i]-1)}
  propagate(M,c,3);
  let best=-1,bp=99;
  for(let w=0;w<M.W;w++){const i=M.gi[w];if(vals[i]==+pz.sol[i])continue;const p=PC[c[w]]||9;if(p<bp){bp=p;best=i}}
  return best;
}
// true when every run adds up and has no repeated digit (for a unique puzzle that means it is solved)
export function isSolved(pz,runs,vals){
  for(const r of runs){let s=0,seen=0;for(const i of r.cells){const d=vals[i];if(!d)return false;const b=1<<(d-1);if(seen&b)return false;seen|=b;s+=d}if(s!==r.sum)return false}
  return true;
}
