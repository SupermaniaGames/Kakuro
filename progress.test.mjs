import * as PG from '../progress.js';
import * as K from '../kakuro.js';
let fails=0;const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y){fails++;console.log('FAIL',m,'got',x,'want',y)}else console.log('ok  ',m)};
const mem=()=>{const o={};return{getItem:k=>k in o?o[k]:null,setItem:(k,v)=>{o[k]=String(v)},removeItem:k=>{delete o[k]},o}};

// progress
let st=mem(),p=PG.loadProg(st);eq([p.cleared,PG.unlockedLevel(p)],[0,1],'fresh player: level 1 unlocked');
PG.startAttempt(p,'L1');PG.startAttempt(p,'L1');
let r=PG.recordClear(p,{level:1,ms:90000,hints:1});
eq([r.first,r.newBest,r.attempts,p.cleared,p.att.L1],[true,true,2,1,undefined],'first clear: unlocks 2, attempts 2, counter reset');
eq(p.best[1],{ms:90000,a:2,h:1},'best stores time, attempts, hints');
r=PG.recordClear(p,{level:1,ms:120000,hints:0});eq([r.first,r.newBest,p.best[1].ms,p.cleared],[false,false,90000,1],'slower replay keeps best, does not re-unlock');
r=PG.recordClear(p,{level:1,ms:60000,hints:0});eq([r.newBest,p.best[1],r.attempts],[true,{ms:60000,a:1,h:0},1],'faster replay is new best; attempts default 1');
r=PG.recordClear(p,{level:5,ms:1000,hints:0});eq([r.first,p.cleared],[false,1],'cannot skip ahead');
PG.recordClear(p,{level:2,ms:30000,hints:0});eq(PG.stats(p),{cleared:2,n:2,fastest:30000,avg:45000},'stats');
PG.saveProg(st,p);eq(PG.loadProg(st),p,'save/load round trip');
for(const bad of ['{','null','[]','{"cleared":-1,"best":{}}','{"cleared":"3","best":{}}','{"cleared":2,"best":5}'])eq(PG.loadProg({getItem:()=>bad}).cleared,0,'damaged progress ignored: '+bad);
eq(PG.loadProg({getItem:()=>JSON.stringify({cleared:2,best:{1:{ms:5},9:{ms:5},x:{ms:5},2:{ms:-1}}})}).best,{1:{ms:5,a:1,h:0}},'best entries beyond cleared / bad ones dropped');
eq(PG.loadProg({getItem(){throw new Error('blocked')}}).cleared,0,'storage that throws is survived');
eq(PG.saveProg({setItem(){throw new Error('full')}},p),false,'full storage does not throw');

// saved game
const pz=K.levelPuzzle(40),N=pz.rows*pz.cols,sol=[...pz.sol].map(Number);
const g={meta:{type:'level',level:40,title:'Level 40'},pz,v:new Int8Array(N),n:new Uint16Array(N),lock:new Uint8Array(N),hints:1,hintMax:3,checks:0,moves:5,counted:true,pencil:true,hist:[]};
const w=sol.findIndex(x=>x);g.v[w]=sol[w];g.lock[w]=1;g.n[w+1]=5;g.hist.push([{i:w,v0:0,n0:0,v1:sol[w],n1:0}]);
let s2=mem();eq(PG.writeSave(s2,g,12345),true,'write save');
const back=PG.readSave(s2);eq([back.ms,back.hints,back.cells[w],back.n[w+1],back.pz.sol===pz.sol,back.hist.length,back.pencil],[12345,1,String(sol[w]),5,true,1,true],'save round trip');
console.log('save size for a 40-level puzzle:',s2.o.kk_save.length,'bytes;','11x11:',(()=>{const z=K.levelPuzzle(1500),M=z.rows*z.cols,gg={...g,pz:z,meta:{type:'level',level:1500,title:'x'},v:new Int8Array(M),n:new Uint16Array(M),lock:new Uint8Array(M)};const t=mem();PG.writeSave(t,gg,1);return t.o.kk_save.length})(),'bytes');
const tamper=(f,label)=>{const o=JSON.parse(s2.o.kk_save);f(o);eq(PG.readSave({getItem:()=>JSON.stringify(o)}),null,'tampered save rejected: '+label)};
tamper(o=>o.cells=o.cells.slice(1),'cells too short');
tamper(o=>{const b=o.pz.t.indexOf(0);o.cells=o.cells.slice(0,b)+'5'+o.cells.slice(b+1)},'digit in black square');
tamper(o=>o.n[w]=999,'note mask too big');
tamper(o=>o.hist=[[{i:9999,v0:0,v1:1,n0:0,n1:0}]],'history index out of range');
tamper(o=>o.hints=99,'hints out of range');
tamper(o=>o.meta.type='daily','type not supported yet');
tamper(o=>o.pz.rows=2,'rows silly');
tamper(o=>o.pz.a[0]=1000,'clue too big');
eq(PG.readSave({getItem:()=>'garbage'}),null,'garbage rejected');eq(PG.readSave(mem()),null,'no save is null');
PG.clearSave(s2);eq(PG.readSave(s2),null,'clearSave');
process.exit(fails?1:0);
