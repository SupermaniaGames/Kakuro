// Step 3 end-to-end: Daily 5, streak, Firebase sync (mocked), offline outbox, guest/Google/account rules, leaderboard.
import {chromium} from 'playwright';
import * as K from '../kakuro.js';
import * as PG from '../progress.js';
const BASE=Date.UTC(2026,9,5,6,30);               // Mon 5 Oct 2026, 12:00 in India
const DAY0=PG.dayNum(BASE);
let bad=0;const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c){bad++;process.exitCode=1}};

/* ---- a fake Firebase that lives in Node, shared by every "phone" ---- */
const srv={accounts:{},players:{},summ:{},items:{},board:{},google:{},offline:false,n:{loadSummary:0,syncClear:0,fetchBoard:0,myRank:0,submitBoard:0},seq:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const gate=async()=>{while(srv.offline)await sleep(50)};   // like Firestore: offline writes wait until the connection returns
async function call(op,a){
  switch(op){
    case 'signIn':{const x=srv.accounts[a.u.toLowerCase()];if(!x||x.pass!==a.p)return{err:'auth/invalid-credential'};return{uid:x.uid,name:x.name}}
    case 'signUp':{const k=a.u.toLowerCase();if(srv.accounts[k])return{err:'auth/email-already-in-use'};const uid=a.uid||'u'+(++srv.seq);srv.accounts[k]={uid,pass:a.p,name:a.u};return{uid,name:a.u}}
    case 'guest':return{uid:'g'+(++srv.seq)};
    case 'google':{const ex=srv.google[a.who];
      if(a.uid){if(ex&&ex.uid!==a.uid)return{uid:ex.uid,name:ex.name,switched:true};srv.google[a.who]={uid:a.uid,name:a.who};return{uid:a.uid,name:a.who}}
      if(ex)return{uid:ex.uid,name:ex.name};const uid='u'+(++srv.seq);srv.google[a.who]={uid,name:a.who};return{uid,name:a.who}}
    case 'loadSummary':srv.n.loadSummary++;if(srv.offline)return{err:'unavailable'};return{doc:srv.summ[a.uid]||null};
    case 'syncClear':{srv.n.syncClear++;await gate();for(const it of a.items)(srv.items[a.uid]=srv.items[a.uid]||{})[it.pid]=it.data;srv.summ[a.uid]=a.summary;return{}}
    case 'submitBoard':{srv.n.submitBoard++;await gate();(srv.board[a.day]=srv.board[a.day]||{})[a.uid]=a.d;return{}}
    case 'fetchBoard':{srv.n.fetchBoard++;if(srv.offline)return{err:'unavailable'};return{rows:Object.entries(srv.board[a.day]||{}).map(([uid,d])=>({uid,...d})).sort((x,y)=>x.score-y.score).slice(0,a.n)}}
    case 'myRank':{srv.n.myRank++;return{rank:Object.values(srv.board[a.day]||{}).filter(d=>d.score<a.score).length+1}}
    case 'saveProfile':srv.players[a.uid]={...srv.players[a.uid],...a.d};return{};
    case 'loadProfile':return{doc:srv.players[a.uid]||null};
  }
}
const MOCK=`
let cbs=[];const ST=()=>{try{return JSON.parse(localStorage.getItem('mock_auth'))}catch{return null}};
const setSt=x=>{if(x)localStorage.setItem('mock_auth',JSON.stringify(x));else localStorage.removeItem('mock_auth')};
const C=(op,a)=>window.__srv(op,JSON.stringify(a===undefined?null:a)).then(r=>{r=JSON.parse(r);if(r&&r.err)throw {code:r.err,message:r.err};return r});
const fire=()=>cbs.forEach(c=>c(ST()));
export const me=()=>ST();
export const onUser=cb=>{cbs.push(cb);setTimeout(()=>cb(ST()))};
export const signIn=async(u,p)=>{const r=await C('signIn',{u,p});setSt({uid:r.uid,name:r.name,anon:false});fire()};
export const signUp=async(u,p)=>{const cu=ST(),link=cu&&cu.anon,r=await C('signUp',{u,p,uid:link?cu.uid:null});setSt({uid:r.uid,name:r.name,anon:false});if(!link)fire()};
export const guest=async n=>{const r=await C('guest');setSt({uid:r.uid,name:n,anon:true});fire()};
export const googleSignIn=async()=>{if(window.__googleErr)throw {code:window.__googleErr};const cu=ST(),r=await C('google',{who:window.__googleAs||'asha_g',uid:cu&&cu.anon?cu.uid:null});setSt({uid:r.uid,name:r.name,anon:false});if(!(cu&&cu.anon)||r.switched)fire()};
export const logout=async()=>{setSt(null);fire()};
export const saveProfile=async av=>{const u=ST();if(u)await C('saveProfile',{uid:u.uid,d:{kkav:av,name:u.name}})};
export const loadProfile=async()=>{const u=ST();if(!u)return null;return (await C('loadProfile',{uid:u.uid})).doc};
export const loadSummary=async()=>{const u=ST();if(!u)return null;return (await C('loadSummary',{uid:u.uid})).doc};
export const syncClear=async({items,summary})=>{const u=ST();if(!u)throw new Error('not signed in');await C('syncClear',{uid:u.uid,items,summary})};
export const submitBoard=async(day,d)=>{const u=ST();if(!u)throw new Error('not signed in');await C('submitBoard',{uid:u.uid,day,d:{name:d.name,av:d.av,ms:d.ms,hints:d.hints,score:d.score,day,finished:d.finished}})};
export const fetchBoard=async(day,n)=>(await C('fetchBoard',{day,n})).rows;
export const myRank=async(day,score)=>(await C('myRank',{day,score})).rank;
`;
const b=await chromium.launch();
async function phone(){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'}),pg=await ctx.newPage(),errs=[];
  await ctx.addInitScript(({base})=>{const rn=Date.now.bind(Date);let o=localStorage.getItem('mock_off');if(o===null){o=base-rn();localStorage.setItem('mock_off',o)}Date.now=()=>rn()+Number(o)+Number(localStorage.getItem('mock_extra')||0)},{base:BASE});
  await pg.exposeFunction('__srv',async(op,a)=>JSON.stringify(await call(op,JSON.parse(a))||{}));
  await pg.route('**/multiplayer.js',r=>r.fulfill({contentType:'text/javascript',body:MOCK}));
  pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()=='error'&&!/gstatic|net::|Failed to load|ERR_/i.test(m.text()))errs.push('CONSOLE '+m.text())});
  const P={ctx,pg,errs};
  P.boot=async()=>{await pg.goto('http://localhost:8123/index.html');await pg.waitForFunction(()=>document.getElementById('dsub')&&document.getElementById('dsub').textContent!=='');await pg.evaluate(()=>document.getElementById('splash')?.remove())};
  P.ls=k=>pg.evaluate(k=>localStorage.getItem(k),k);
  P.wait=(fn,t=6000)=>pg.waitForFunction(fn,null,{timeout:t});
  P.solve=async pz=>{const sol=[...pz.sol].map(Number);await pg.evaluate(sol=>{document.querySelectorAll('#kgrid .w').forEach(el=>{el.click();window.dispatchEvent(new KeyboardEvent('keydown',{key:String(sol[+el.dataset.i])}))})},sol)};
  P.nextDay=async n=>{await pg.evaluate(n=>localStorage.setItem('mock_extra',String(n*86400000)),n);await P.boot()};
  return P;
}
const dp=(k,off=0)=>K.dailyPuzzle(DAY0+off,k);

/* ===== phone 1: a brand-new player ===== */
const A=await phone(),pg=A.pg;await A.boot();
ok((await pg.textContent('#dsub'))=='0 of 5 today','home: Daily tile shows 0 of 5');
await pg.click('[data-go=daily]');
ok((await pg.textContent('#dinfo')).includes('Mon 5 Oct')&&/New puzzles in 1[12]h/.test(await pg.textContent('#dinfo')),'daily screen: India date and countdown to midnight');
const names=await pg.locator('#dlist .drow .tx').allTextContents();
ok(names.length==5&&names[0].startsWith('Easy')&&names[4].startsWith('Expert')&&names[0].includes('5 × 6')&&names[4].includes('10 × 10'),'five rows from Easy 5×6 to Expert 10×10: '+names.map(x=>x.replace(/\s+/g,' ')).join(' | '));
await pg.screenshot({path:'shots/30-daily-new.png'});
// play Daily 1 through the UI, with one hint
await pg.click('#dlist .drow:nth-child(1)');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Daily 1');
ok(await pg.isVisible('#game'),'row opens Daily 1');
let pz=dp(0),w=[];pz.t.forEach((t,i)=>t&&w.push(i));
await pg.locator('#kgrid .w[data-i="'+w[0]+'"]').click();await pg.click('#hintbtn');
await A.solve(pz);await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
let rl=(await pg.textContent('#rlist')).replace(/\s+/g,' ');
ok((await pg.textContent('#rtitle'))=='Daily 1 done!'&&rl.includes('Today1 of 5')&&rl.includes('+0:30'),'result: Daily 1 done, 1 of 5, hint penalty shown (+0:30)');
ok((await pg.textContent('#rnext'))=='Next puzzle','button says Next puzzle');
const prog1=JSON.parse(await A.ls('kk_prog'));ok(prog1.daily.day=='20261005'&&prog1.daily.done[0].h==1&&prog1.daily.done[0].a==1,'kk_prog has today first clear (hint 1, attempt 1)');
ok(JSON.parse(await A.ls('kk_out')).length==1,'clear queued in kk_out (not signed in yet)');
// Next puzzle chain: 2, 3, 4, 5
for(let k=1;k<5;k++){
  await pg.click('#rnext');await pg.waitForFunction(k=>document.getElementById('gtitle').textContent==='Daily '+(k+1)&&document.getElementById('result').hidden,k);
  await A.solve(dp(k));await pg.waitForSelector('#result:not([hidden])',{timeout:8000});
}
rl=(await pg.textContent('#rlist')).replace(/\s+/g,' ');
ok((await pg.textContent('#rtitle'))=='Daily 5 done!'&&rl.includes('Today5 of 5')&&rl.includes('Streak1 day')&&(await pg.textContent('#rnext'))=='Leaderboard','Daily 5 done: all five, streak 1, button says Leaderboard');
const pf=JSON.parse(await A.ls('kk_prog')),tot=Object.values(pf.daily.done).reduce((a,x)=>a+x.ms,0),sc=tot+30000;
ok(pf.streak==1&&pf.fullDays==1&&Object.keys(pf.daily.done).length==5,'progress: streak 1, 5 done');
await pg.screenshot({path:'shots/31-daily-result.png'});
ok(JSON.parse(await A.ls('kk_out')).length==6,'queue holds 5 clears + 1 leaderboard entry');
// seed some other players on the board
srv.board['20261005']={s1:{name:'Ravi',av:'🦁',ms:300000,hints:0,score:300000,day:'20261005',finished:1},s2:{name:'Meera',av:'🐼',ms:20000,hints:0,score:20000,day:'20261005',finished:1},s3:{name:'Zed',av:'🤖',ms:9e6,hints:3,score:9e6+90000,day:'20261005',finished:1}};
await pg.click('#rnext');await pg.waitForSelector('#board:not([hidden])');await pg.waitForSelector('#blist .brow');
ok((await pg.locator('#blist .brow').count())==3&&(await pg.textContent('#bmsg')).includes('Sign in or play as a guest'),'board lists the others; asks me to sign in (not signed in)');
ok((await pg.locator('#blist .brow .nm').first().textContent())=='Meera','board sorted by score (Meera first)');
await pg.screenshot({path:'shots/32-board-signedout.png'});

/* ===== sign in as guest from the board: queue flushes, entry appears, rank right ===== */
const f0=srv.n.fetchBoard;
await pg.click('#bsign');
await pg.click('#guest');await A.wait(()=>document.getElementById('home')&&!document.getElementById('home').hidden);
await A.wait(()=>(JSON.parse(localStorage.getItem('kk_out')||'[]')).length==0,8000);
const guid=JSON.parse(await A.ls('mock_auth')).uid;
ok(!!srv.summ[guid]&&Object.keys(srv.items[guid]).sort().join()=='D20261005-0,D20261005-1,D20261005-2,D20261005-3,D20261005-4','guest sign-in pushed 5 daily records + summary to the guest uid');
ok(srv.summ[guid].streak==1&&srv.summ[guid].daily.day=='20261005'&&Object.keys(srv.summ[guid].daily.done).length==5,'summary document: streak 1, five dailies');
ok(srv.items[guid]['D20261005-0'].hints==1&&srv.items[guid]['D20261005-0'].attempts==1&&srv.items[guid]['D20261005-0'].kind=='daily'&&srv.items[guid]['D20261005-0'].idx==0,'item has kind, idx, hints, attempts');
const ent=srv.board['20261005'][guid];ok(ent&&ent.score==sc&&ent.hints==1&&ent.ms==tot&&ent.name.startsWith('Guest'),'leaderboard entry: score = total + 30s per hint ('+(ent&&ent.score)+')');
await pg.click('[data-go=daily]');await pg.click('#dboard');await pg.waitForSelector('#blist .brow.me');
const exp=1+[300000,20000,9e6+90000].filter(x=>x<sc).length;
ok((await pg.locator('#blist .brow').count())==4&&(await pg.locator('#blist .brow.me .rk').textContent())==String(exp),'my row highlighted at rank '+exp);
await pg.screenshot({path:'shots/33-board-me.png'});
// cache: re-opening within 3 minutes does not read again; refresh does
const f1=srv.n.fetchBoard;await pg.click('#board [data-back]');await pg.click('#dboard');await pg.waitForSelector('#blist .brow.me');
ok(srv.n.fetchBoard==f1,'board reused for 3 minutes (no extra reads)');
await pg.click('#bref');await pg.waitForTimeout(400);ok(srv.n.fetchBoard==f1+1,'Refresh reads again');

/* ===== practice replay of a solved daily is not recorded ===== */
await pg.click('#board [data-back]');await pg.click('#dlist .drow:nth-child(2)');
ok(await pg.isVisible('#dlg')&&(await pg.textContent('#dt')).includes('Practice'),'tapping a solved puzzle offers practice');
await pg.click('#dyes');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent.includes('practice'));
await A.solve(dp(1));await pg.waitForSelector('#result:not([hidden])',{timeout:8000});
ok((await pg.textContent('#rlist')).includes('Practice: not recorded'),'practice result says not recorded');
const before=JSON.stringify(JSON.parse(await A.ls('kk_prog')).daily);ok(JSON.parse(await A.ls('kk_prog')).daily.done[1].ms==pf.daily.done[1].ms,'practice did not change the recorded time');
await pg.click('#rmenu');

/* ===== guest creates an account: same uid, progress stays ===== */
await pg.click('#me .btn');await pg.fill('#u','asha');await pg.fill('#p','secret1');await pg.click('#signup');
await A.wait(()=>JSON.parse(localStorage.getItem('mock_auth')||'{}').anon===false);await A.wait(()=>document.getElementById('home')&&!document.getElementById('home').hidden);
ok(JSON.parse(await A.ls('mock_auth')).uid==guid&&srv.accounts.asha.uid==guid,'guest -> account keeps the same uid');
await pg.waitForTimeout(500);ok(JSON.parse(await A.ls('kk_prog')).ownAnon===false&&Object.keys(srv.summ).length==1,'progress now owned by the real account; no second summary created');

/* ===== level clears sync; second phone sees everything ===== */
await pg.click('[data-go=play]');await pg.click('#play');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 1');
await A.solve(K.levelPuzzle(1));await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
await A.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0);
ok(srv.summ[guid].cleared==1&&srv.items[guid].L1.kind=='level'&&srv.items[guid].L1.level==1&&srv.items[guid].L1.ms>0,'Level 1 clear: item L1 + summary.cleared=1 in one flush');
await pg.click('#rmenu');
const Bp=await phone();await Bp.boot();
await Bp.pg.click('#me .btn');await Bp.pg.fill('#u','asha');await Bp.pg.fill('#p','secret1');await Bp.pg.click('#signin');
await Bp.wait(()=>document.getElementById('lvsub').textContent.startsWith('Level 2'));
ok((await Bp.pg.textContent('#dsub')).startsWith('5 of 5')&&(await Bp.pg.textContent('#dsub')).includes('🔥1'),'second phone after sign-in: Level 2 offered, Daily 5 of 5, streak 1');
await Bp.pg.click('[data-go=daily]');ok((await Bp.pg.locator('#dlist .drow.done').count())==5,'second phone shows all five dailies done with times');

/* ===== offline: the queue waits, survives a restart, then flushes ===== */
srv.offline=true;
await pg.click('[data-go=play]');await pg.click('#play');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 2');
await A.solve(K.levelPuzzle(2));await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
ok(JSON.parse(await A.ls('kk_out')).some(o=>o.pid=='L2')&&!(srv.items[guid].L2),'offline: clear is on the phone and queued, server has nothing yet');
await pg.click('#rmenu');ok((await pg.textContent('#lvsub')).startsWith('Level 3'),'offline: Level 3 is already unlocked');
await A.boot();ok(JSON.parse(await A.ls('kk_out')).some(o=>o.pid=='L2'),'queue survives closing the app while offline');
srv.offline=false;await pg.evaluate(()=>window.dispatchEvent(new Event('online')));
try{await A.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0,6000)}catch(e){console.log('DEBUG out',await A.ls('kk_out'),'calls',JSON.stringify(srv.n),'auth',await A.ls('mock_auth'),'errs',A.errs.join('|'))}
ok(srv.items[guid].L2&&srv.summ[guid].cleared==2,'back online: L2 item and summary.cleared=2 arrived, queue empty');

/* ===== a new day ===== */
await pg.click('[data-go=daily]');ok((await pg.textContent('#dinfo')).includes('Mon 5 Oct'),'(still today)');await pg.click('#dlist .drow:nth-child(1)');
await pg.click('#dyes');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent.includes('practice'));
await pg.evaluate(()=>{});await pg.click('#bar [data-back]');
await A.nextDay(1);
ok((await pg.textContent('#dsub')).startsWith('0 of 5')&&(await pg.textContent('#dsub')).includes('🔥1'),'next day: five fresh puzzles, streak still alive (🔥1)');
ok(await pg.isHidden('#cont'),'a practice game from yesterday is discarded at midnight');
await pg.click('[data-go=daily]');ok((await pg.textContent('#dinfo')).includes('Tue 6 Oct'),'next day label Tue 6 Oct');
const pz2=K.dailyPuzzle(DAY0+1,0);ok(JSON.stringify(pz2.sol)!==JSON.stringify(dp(0).sol),'new day gives a different puzzle');
// start a fresh daily, leave it saved, midnight passes -> discarded, and a puzzle finished after midnight is not recorded
await pg.click('#dlist .drow:nth-child(1)');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Daily 1');
await pg.evaluate(()=>localStorage.setItem('mock_extra',String(2*86400000)));      // clock jumps to the day after, while playing
await A.solve(pz2);await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
ok((await pg.textContent('#rlist')).includes('not recorded')&&(await pg.textContent('#rnext'))=='Daily 5','finishing after midnight is not recorded');
await pg.click('#rmenu');
await A.nextDay(4);ok((await pg.textContent('#dsub')).startsWith('0 of 5')&&!(await pg.textContent('#dsub')).includes('🔥'),'after missing days the streak is gone');

/* ===== different account on the same phone: no mixing ===== */
srv.accounts.bob={uid:'ubob',pass:'secret1',name:'bob'};srv.summ.ubob={cleared:1,best:{1:{ms:7777,a:1,h:0}},daily:{day:'',done:{}},streak:0,bestStreak:0,lastFull:0,fullDays:0};
await pg.click('#me .btn');ok((await pg.textContent('#me .btn'))=='Sign in','logged out');
await pg.click('#me .btn');await pg.fill('#u','bob');await pg.fill('#p','secret1');await pg.click('#signin');
await A.wait(()=>document.getElementById('lvsub').textContent.startsWith('Level 2'));
ok(JSON.parse(await A.ls('kk_prog')).own=='ubob'&&JSON.parse(await A.ls('kk_prog')).cleared==1,"another account on this phone: bob's own progress replaces asha's (not merged)");
await pg.waitForTimeout(600);ok(srv.summ[guid].cleared==2&&srv.summ.ubob.cleared==1,"asha's server copy untouched, bob's not contaminated");

/* ===== Google ===== */
const G=await phone();await G.boot();
await G.pg.click('#me .btn');ok(await G.pg.isVisible('#google'),'auth screen has Continue with Google');
await G.pg.screenshot({path:'shots/34-auth.png'});
await G.pg.evaluate(()=>{window.__googleErr='auth/popup-blocked'});await G.pg.click('#google');
ok((await G.pg.textContent('#aerr')).includes('blocked'),'popup blocked: friendly message');
await G.pg.evaluate(()=>{window.__googleErr='auth/popup-closed-by-user'});await G.pg.click('#google');ok((await G.pg.textContent('#aerr')).includes('cancelled'),'popup closed: friendly message');
await G.pg.evaluate(()=>{window.__googleErr=''});
await G.pg.click('#guest');await G.pg.waitForSelector('#home:not([hidden])');                    // a guest first, with a cleared level
await G.pg.click('[data-go=play]');await G.pg.click('#play');await G.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 1');
await G.solve(K.levelPuzzle(1));await G.pg.waitForSelector('#result:not([hidden])');await G.pg.click('#rmenu');
await G.pg.click('#me .btn');await G.pg.click('#google');await G.wait(()=>JSON.parse(localStorage.getItem('mock_auth')||'{}').anon===false);
const gu=JSON.parse(await G.ls('mock_auth'));await G.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0);
ok(gu.name=='asha_g'&&srv.summ[gu.uid]&&srv.summ[gu.uid].cleared==1,'guest + Google: linked (same uid), guest progress is in the Google account');
await G.pg.click('#me .btn');                                                                      // log out
const G2=await phone();await G2.boot();await G2.pg.click('#me .btn');                              // another phone, fresh guest with Level 1 cleared, then Google (account exists)
await G2.pg.click('#guest');await G2.pg.waitForSelector('#home:not([hidden])');
await G2.pg.click('[data-go=play]');await G2.pg.click('#play');await G2.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 1');
await G2.solve(K.levelPuzzle(1));await G2.pg.waitForSelector('#result:not([hidden])');await G2.pg.click('#rnext');
await G2.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 2');await G2.solve(K.levelPuzzle(2));await G2.pg.waitForSelector('#result:not([hidden])');await G2.pg.click('#rmenu');
await G2.pg.click('#me .btn');await G2.pg.click('#google');
await G2.wait(()=>document.getElementById('lvsub').textContent.startsWith('Level 3'),8000);
await G2.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0);await G2.pg.waitForTimeout(400);
ok(srv.summ[gu.uid].cleared==2,'guest on a second phone signs in with an existing Google account: progress merged (levels 1+2), account updated');
const errsAll=[...A.errs,...Bp.errs,...G.errs,...G2.errs];console.log(errsAll.length?errsAll.join('\n'):'no page errors');
console.log(bad?bad+' FAILED':'ALL PASSED');
await b.close();
