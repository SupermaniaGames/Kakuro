import {chromium} from 'playwright';
import * as K from '../kakuro.js';
const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()=='error'&&!/gstatic|net::|Failed to load|firebase|Firebase/i.test(m.text()))errs.push('CONSOLE '+m.text())});
const U='http://localhost:8123/index.html';let bad=0;
const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c){bad++;process.exitCode=1}};
const ls=k=>pg.evaluate(k=>localStorage.getItem(k),k);
const cell=i=>pg.locator('#kgrid .w[data-i="'+i+'"]');
async function solve(N,skip=0){const pz=K.levelPuzzle(N),sol=[...pz.sol].map(Number),w=[];pz.t.forEach((t,i)=>t&&w.push(i));
  for(const i of w.slice(skip)){await cell(i).click();await pg.keyboard.press(String(sol[i]))}return{pz,sol,w}}
const boot=async()=>{await pg.goto(U);await pg.waitForFunction(()=>document.getElementById('lvsub')&&document.getElementById('lvsub').textContent!=='');await pg.evaluate(()=>document.getElementById('splash')?.remove())};
await boot();
ok((await pg.textContent('#lvsub'))=='Level 1','home shows Level 1 for a new player');
ok(await pg.isHidden('#cont'),'no Continue button without a saved game');
await pg.click('[data-go=play]');
ok((await pg.inputValue('#lvn'))=='1'&&await pg.isDisabled('#lvp')&&await pg.isDisabled('#lvm'),'picker: level 1, + and - disabled (nothing else unlocked)');
await pg.fill('#lvn','57');await pg.dispatchEvent('#lvn','change');ok((await pg.inputValue('#lvn'))=='1','typing a locked level snaps back to 1');
await pg.screenshot({path:'tests/shots/20-picker-new.png'});
await pg.click('#play');await pg.waitForSelector('#kgrid .w');
ok(await ls('kk_save')===null,'no save until a first move');
// first move counts an attempt; note-only does not
const pz1=K.levelPuzzle(1),sol1=[...pz1.sol].map(Number),w1=[];pz1.t.forEach((t,i)=>t&&w1.push(i));
await cell(w1[0]).click();await pg.click('#notes');await pg.click('.nb[data-d="3"]');await pg.click('#notes');
ok(JSON.parse(await ls('kk_prog')||'{"att":{}}').att.L1===undefined,'a note does not count as an attempt');
ok((await ls('kk_save'))!==null,'a note is autosaved');
await pg.keyboard.press(String(sol1[w1[0]]));
ok(JSON.parse(await ls('kk_prog')).att.L1===1,'first digit counts attempt 1');
// leave and resume after a full reload
await pg.waitForTimeout(1300);
await pg.click('#bar [data-back]');ok(await pg.isVisible('#home')&&!(await pg.isVisible('#dlg')),'Menu leaves without a warning (game is saved)');
ok((await pg.textContent('#cont')).includes('Continue Level 1'),'Continue button shows the level');
await boot();
ok((await pg.textContent('#cont')).includes('Continue Level 1'),'Continue survives a reload');
await pg.click('#cont');await pg.waitForSelector('#kgrid .w');
ok((await cell(w1[0]).locator('.dg').textContent())==String(sol1[w1[0]]),'digit restored');
ok(await pg.isEnabled('#undo'),'undo history restored');
const tm=await pg.textContent('#time');ok(/^0:0[1-9]|^0:[1-5]\d/.test(tm),'timer restored, not reset ('+tm+')');
await pg.click('#undo');ok((await cell(w1[0]).locator('.nt i').allTextContents()).join('')=='3','undo after resume restores the earlier note');
await pg.click('#redo');
// hint on fresh board after resume uses same attempt
await pg.click('#hintbtn');ok(JSON.parse(await ls('kk_prog')).att.L1===1,'resume + hint stays attempt 1');
// finish
await solve(1,0);
await pg.waitForSelector('#result:not([hidden])',{timeout:4000});
const rl=await pg.textContent('#rlist');
ok((await pg.textContent('#rtitle')).includes('Level 1 cleared'),'first clear says cleared');
ok(rl.includes('Attempts')&&/Attempts1/.test(rl.replace(/\s/g,'')),'attempts shown = 1');
ok(rl.includes('Hints used')&&rl.includes('1 of'),'hints shown');
ok((await pg.textContent('#result')).includes('Level 2 is unlocked'),'unlock message');
const prog=JSON.parse(await ls('kk_prog'));ok(prog.cleared===1&&prog.best[1].ms>0&&prog.best[1].a===1&&prog.best[1].h===1&&!prog.att.L1,'kk_prog written: cleared, best, attempt counter reset');
ok(await ls('kk_save')===null,'save removed after the clear');
await pg.screenshot({path:'tests/shots/21-result.png'});
// Next level
await pg.click('#rnext');await pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 2'&&document.getElementById('result').hidden);ok((await pg.textContent('#gtitle'))=='Level 2','Next level starts Level 2');
// start level 2, one move, go home, picker: Resume / Start over / locked 3
const pz2=K.levelPuzzle(2),sol2=[...pz2.sol].map(Number),w2=[];pz2.t.forEach((t,i)=>t&&w2.push(i));
await cell(w2[0]).click();await pg.keyboard.press(String(sol2[w2[0]]));
await pg.click('#bar [data-back]');await pg.click('[data-go=play]');
ok((await pg.inputValue('#lvn'))=='2'&&(await pg.textContent('#play'))=='Resume'&&await pg.isVisible('#restart'),'picker on level 2: Resume + Start over');
ok((await pg.textContent('#lvinfo')).includes('In progress'),'picker shows In progress');
await pg.screenshot({path:'tests/shots/22-picker-progress.png'});
await pg.click('#lvm');ok((await pg.inputValue('#lvn'))=='1'&&(await pg.textContent('#lvinfo')).includes('Best time'),'level 1 shows best time, attempts, hints');
ok(await pg.isVisible('#lvcur'),'Go to my level appears on an old level');
// replaying old level while level 2 is saved asks before discarding
await pg.click('#play');ok(await pg.isVisible('#dlg')&&(await pg.textContent('#dp')).includes('discard'),'starting another level asks before discarding');
await pg.click('#dno');ok(await ls('kk_save')!==null,'Stay keeps the saved game');
await pg.click('#lvcur');await pg.click('#restart');ok(await pg.isVisible('#dlg'),'Start over asks first');
await pg.click('#dyes');await pg.waitForSelector('#kgrid .w');
ok(await ls('kk_save')===null,'Start over erases the save');
await cell(w2[0]).click();await pg.keyboard.press(String(sol2[w2[0]]));
ok(JSON.parse(await ls('kk_prog')).att.L2===2,'start over then first digit = attempt 2');
await solve(2,0);await pg.waitForSelector('#result:not([hidden])',{timeout:4000});
ok(/Attempts2/.test((await pg.textContent('#rlist')).replace(/\s/g,'')),'result shows attempts 2');
ok(JSON.parse(await ls('kk_prog')).cleared===2,'level 2 cleared');
// replay of a cleared level keeps cleared and best logic
await pg.click('#rmenu');await pg.click('[data-go=play]');ok((await pg.inputValue('#lvn'))=='3','picker opens on the new level 3');
await pg.click('#lvm');await pg.click('#lvm');await pg.click('#play');await pg.waitForSelector('#kgrid .w');
const w=await solve(1,0);await pg.waitForSelector('#result:not([hidden])',{timeout:4000});
ok((await pg.textContent('#rtitle')).includes('Level 1 solved'),'replay says solved, not cleared');
ok(JSON.parse(await ls('kk_prog')).cleared===2,'replay does not change cleared');
// corrupted save and progress do not break the app
await pg.evaluate(()=>{localStorage.setItem('kk_save','{"v":1,"broken":true');localStorage.setItem('kk_prog','nope')});
await boot();ok((await pg.textContent('#lvsub'))=='Level 1'&&await pg.isHidden('#cont'),'damaged storage: app starts fresh, no Continue');
// big level save/resume
await pg.evaluate(()=>localStorage.setItem('kk_prog',JSON.stringify({v:1,cleared:299,best:{},att:{}})));
await boot();await pg.click('[data-go=play]');ok((await pg.inputValue('#lvn'))=='300','set cleared=299 -> level 300 offered');
await pg.click('#play');await pg.waitForSelector('#kgrid .w',{timeout:15000});
await pg.locator('#kgrid .w').nth(3).click();await pg.keyboard.press('5');
const t0=Date.now();await boot();await pg.click('#cont');await pg.waitForSelector('#kgrid .w');
ok((await pg.locator('#kgrid .w').nth(3).locator('.dg').textContent())=='5','10x10 level resumes exactly');
console.log('resume of level 300 took',Date.now()-t0,'ms including page load');
ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
await pg.screenshot({path:'tests/shots/23-resumed-L300.png'});
console.log(errs.length?errs.join('\n'):'no page errors');
await b.close();
