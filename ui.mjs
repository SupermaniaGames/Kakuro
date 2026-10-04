import {chromium} from 'playwright';
import * as K from '../kakuro.js';
const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()=='error'&&!/gstatic|net::|Failed to load|firebase|Firebase/i.test(m.text()))errs.push('CONSOLE '+m.text())});
// mock multiplayer.js (records profile saves)
await pg.route('**/multiplayer.js',r=>r.fulfill({contentType:'text/javascript',body:`
let u=null,cbs=[];window.__saved=[];
export const me=()=>u;export const onUser=cb=>{cbs.push(cb);setTimeout(()=>cb(u))};
const set=x=>{u=x;cbs.forEach(c=>c(u))};
export const signIn=async(n,p)=>{if(p!='secret1')throw {code:'auth/invalid-credential'};set({uid:'a',name:n})};
export const signUp=async(n,p)=>set({uid:'a',name:n});
export const guest=async n=>set({uid:'g',name:n});export const logout=async()=>set(null);
export const saveProfile=async av=>{window.__saved.push(av)};export const loadProfile=async()=>({kkav:'🐙'});`}));
const U='http://localhost:8123/index.html';
const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)process.exitCode=1};
await pg.goto(U);await pg.waitForTimeout(400);
await pg.evaluate(()=>document.getElementById('splash')?.remove());
await pg.screenshot({path:'shots/01-home.png'});
// auth + character
await pg.click('#me .btn');await pg.fill('#u','tester');await pg.fill('#p','bad');await pg.click('#signin');
ok((await pg.textContent('#aerr')).includes('6 or more'),'short password rejected');
await pg.fill('#p','wrongpw');await pg.click('#signin');ok((await pg.textContent('#aerr')).includes('Wrong'),'wrong password message');
await pg.fill('#p','secret1');await pg.click('#signin');await pg.waitForTimeout(200);
ok(await pg.isVisible('#home'),'back on home after sign in');
ok((await pg.evaluate(()=>localStorage.getItem('kk_av')))=='🐙','profile kkav loaded into kk_av');
await pg.click('.avbtn');await pg.click('#avgrid button:nth-child(3)');
ok((await pg.evaluate(()=>window.__saved)).includes('🐼')&&(await pg.evaluate(()=>localStorage.getItem('kk_av')))=='🐼','character saved to kk_av and profile');
await pg.screenshot({path:'shots/02-chars.png'});await pg.click('#chars .btn.p');
ok((await pg.evaluate(()=>localStorage.getItem('kk_user')))=='tester','kk_user stored');
// how to play
await pg.click('#howbtn');await pg.screenshot({path:'shots/03-how-basics.png',fullPage:true});
await pg.click('.seg[data-k=how] button:nth-child(2)');await pg.screenshot({path:'shots/04-how-logic.png',fullPage:true});
await pg.click('.seg[data-k=how] button:nth-child(3)');await pg.screenshot({path:'shots/05-how-controls.png',fullPage:true});
ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll on How to play');
await pg.click('#how .btn.p');
// level picker
await pg.click('[data-go=play]');await pg.screenshot({path:'shots/06-levels.png'});
await pg.fill('#lvn','1');await pg.click('#play');await pg.waitForSelector('#kgrid .w');
await pg.screenshot({path:'shots/07-game-L1.png'});
// play level 1 using its known solution
const pz=K.levelPuzzle(1),sol=[...pz.sol].map(Number);const whites=[];pz.t.forEach((t,i)=>t&&whites.push(i));
const cell=i=>pg.locator('#kgrid .w[data-i="'+i+'"]');
await cell(whites[0]).click();
ok((await pg.textContent('#runs')).includes('/'),'running sums shown after selecting');
// notes mode: write two notes
await pg.click('#notes');await pg.click('.nb[data-d="1"]');await pg.click('.nb[data-d="2"]');
ok((await cell(whites[0]).locator('.nt i').allTextContents()).join('')=='12','notes written');
await pg.click('.nb[data-d="1"]');ok((await cell(whites[0]).locator('.nt i').allTextContents()).join('')=='2','note toggled off');
await pg.screenshot({path:'shots/08-notes.png'});
await pg.click('#notes');
// wrong digit then undo/redo
const wrong=sol[whites[0]]==9?8:sol[whites[0]]+1;
await pg.click('.nb[data-d="'+wrong+'"]');ok((await cell(whites[0]).locator('.dg').textContent())==String(wrong),'digit placed');
await pg.click('#mist');ok(await cell(whites[0]).evaluate(e=>e.classList.contains('bad')),'show mistakes marks wrong digit');
await pg.screenshot({path:'shots/09-mistake.png'});
await pg.click('#undo');ok((await cell(whites[0]).locator('.dg').textContent())=='','undo clears digit (notes back)');
ok((await cell(whites[0]).locator('.nt i').allTextContents()).join('')=='2','undo restores notes');
await pg.click('#redo');ok((await cell(whites[0]).locator('.dg').textContent())==String(wrong),'redo restores digit');
await pg.click('#erase');ok((await cell(whites[0]).locator('.dg').textContent())=='','erase clears');
// hint on selected cell
await pg.click('#hintbtn');ok((await cell(whites[0]).locator('.dg').textContent())==String(sol[whites[0]])&&await cell(whites[0]).evaluate(e=>e.classList.contains('lock')),'hint fills and locks selected square');
await pg.click('#mist');
// duplicates shown red: find two cells in one run, enter same digit
// keyboard solve the rest
for(const i of whites.slice(1)){await cell(i).click();await pg.keyboard.press(String(sol[i]))}
await pg.waitForSelector('#result:not([hidden])',{timeout:4000});
ok((await pg.textContent('#rtitle')).includes('Level 1 solved'),'result screen after solving');
ok((await pg.textContent('#rlist')).includes('1 of'),'hint counted on result');
await pg.screenshot({path:'shots/10-result.png'});
await pg.click('#rreplay');await pg.waitForSelector('#kgrid .w');ok(await pg.isHidden('#result'),'replay restarts');
// leave dialog
await cell(whites[1]).click();await pg.keyboard.press(String(sol[whites[1]]));
await pg.click('#bar [data-back]');ok(await pg.isVisible('#dlg'),'are-you-sure dialog');await pg.screenshot({path:'shots/11-leave.png'});
await pg.click('#dno');ok(await pg.isVisible('#game'),'Stay keeps the game');
await pg.click('#bar [data-back]');await pg.click('#dyes');ok(await pg.isVisible('#home'),'Leave goes home');
// big grids at 390px: fit, no horizontal scroll, cell size
for(const N of [30,120,300,1500]){
  await pg.click('[data-go=play]');await pg.fill('#lvn',String(N));await pg.click('#play');await pg.waitForSelector('#kgrid .w',{timeout:15000});
  const info=await pg.evaluate(()=>{const gr=document.querySelector('#kgrid'),w=document.querySelector('#kgrid .w').getBoundingClientRect();return{sw:document.documentElement.scrollWidth,iw:innerWidth,cs:Math.round(w.width),gw:Math.round(gr.getBoundingClientRect().width),bottom:Math.round(document.querySelector('#tools').getBoundingClientRect().bottom),ih:innerHeight}});
  const P=K.levelProfile(N);
  ok(info.sw<=info.iw,`L${N} ${P.cols}x${P.rows}: no horizontal scroll (cell ${info.cs}px, board ${info.gw}px, tools bottom ${info.bottom}/${info.ih})`);
  const mid=(await pg.locator('#kgrid .w').count())>>1;await pg.locator('#kgrid .w').nth(mid).click();
  await pg.screenshot({path:`shots/12-L${N}.png`});
  await pg.click('#bar [data-back]');if(await pg.isVisible('#dlg'))await pg.click('#dyes');
}
// determinism: browser engine vs Node for levels 1..60
const h=pz=>{let x=0;const s=JSON.stringify([pz.rows,pz.cols,pz.t,pz.a,pz.d,pz.sol]);for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return x};
let nodeH=0;for(let N=1;N<=60;N++)nodeH=(nodeH*7+h(K.levelPuzzle(N)))|0;
const pageH=await pg.evaluate(async()=>{const K=await import('./kakuro.js');const h=pz=>{let x=0;const s=JSON.stringify([pz.rows,pz.cols,pz.t,pz.a,pz.d,pz.sol]);for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))|0;return x};let y=0;for(let N=1;N<=60;N++)y=(y*7+h(K.levelPuzzle(N)))|0;return y});
ok(nodeH===pageH,'Chromium and Node generate identical levels 1-60 ('+pageH+')');
// slow-phone timing in Chromium with 4x CPU throttle
const cdp=await ctx.newCDPSession(pg);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
const tm=await pg.evaluate(async()=>{const K=await import('./kakuro.js');const out={};for(const N of [10,50,150,300,800,2000]){const t=performance.now();K.levelPuzzle(N);out[N]=Math.round(performance.now()-t)}return out});
console.log('4x throttled Chromium ms per level',JSON.stringify(tm));
console.log(errs.length?errs.join('\n'):'no page errors');
await b.close();
