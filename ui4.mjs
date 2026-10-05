// Level leaderboards: ranking by score (time + 30 s per extra attempt + 30 s per hint), submission, improvement, caching, navigation.
import * as K from '../kakuro.js';
import {srv,phone,ok,state,b} from './harness.mjs';
const A=await phone(),pg=A.pg;await A.boot();
const gameOn=t=>pg.waitForFunction(t=>document.getElementById('gtitle').textContent===t&&document.getElementById('result').hidden&&!document.getElementById('game').hidden,t);
const touch=()=>pg.evaluate(()=>{const el=document.querySelector('#kgrid .w');el.click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}))});   // any digit: starts an attempt

// sign in as a guest first, so clears go straight to the account
await pg.click('#me .btn');await pg.click('#guest');await pg.waitForSelector('#home:not([hidden])');
const uid=JSON.parse(await A.ls('mock_auth')).uid;
// seed other players on Level 1. 'Fast' has the fastest time but needed many attempts and hints, so it must NOT be first.
const mk=(name,av,ms,attempts,hints)=>({name,av,ms,attempts,hints,score:ms+30000*(attempts-1)+30000*hints,level:1,finished:1});
srv.lboard[1]={p1:mk('Pro','🦊',25000,1,0),p2:mk('Mid','🐼',20000,1,1),p3:mk('Clean','🐯',60000,1,0),p4:mk('Fast','⚡',10000,6,2)};
// Level 1 with TWO attempts: play a digit, Start over, solve
await pg.click('[data-go=play]');await pg.click('#play');await gameOn('Level 1');await touch();
await pg.click('#bar [data-back]');await pg.click('[data-go=play]');await pg.click('#restart');await pg.click('#dyes');await gameOn('Level 1');await touch();
ok(JSON.parse(await A.ls('kk_prog')).att.L1===2,'two attempts counted before the clear');
await A.solve(K.levelPuzzle(1));await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
const res=(await pg.textContent('#rlist')).replace(/\s+/g,' ');
const ms1=JSON.parse(await A.ls('kk_prog')).best[1].ms;
ok(/Attempts2/.test(res.replace(/ /g,''))&&res.includes('Score')&&res.includes('Best score'),'result shows Time, Score, Best score and Attempts 2');
ok((await pg.textContent('#rlist')).includes('Score = time + 30 s per extra attempt'),'result explains the score');
ok(await pg.isVisible('#rlb'),'result has a Level leaderboard button');
await A.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0,8000);
const e1=srv.lboard[1][uid];
ok(e1&&e1.attempts===2&&e1.hints===0&&e1.ms===ms1&&e1.score===ms1+30000&&e1.level===1&&e1.name.startsWith('Guest'),'server entry: ms, attempts 2, hints 0, score = ms + 30 s');
ok(JSON.parse(await A.ls('kk_prog')).lbs[1]===ms1+30000,'phone remembers the score the board has');
await pg.screenshot({path:'shots/40-level-result.png'});
// open the board from the result screen
await pg.click('#rlb');await pg.waitForSelector('#blist .brow.me');
ok((await pg.textContent('#btitle'))=='Level 1 leaderboard','title: Level 1 leaderboard');
let names=await pg.locator('#blist .brow .nm').allTextContents();
ok(names.join()=='Pro,'+e1.name+',Mid,Clean,Fast'.replace('Mid,Clean,Fast','Mid,Clean,Fast'),'order by score, not time: '+names.join(' > '));
ok((await pg.locator('#blist .brow.me .rk').textContent())=='2'&&(await pg.locator('#blist .brow.me').textContent()).includes('2 attempts'),'my row is #2 and shows 2 attempts');
ok((await pg.locator('#blist .brow').last().textContent()).includes('6 attempts · 2 hints'),'the fastest-time player with 6 attempts and 2 hints is last');
await pg.screenshot({path:'shots/41-level-board.png'});
// back goes to the level picker on that level
await pg.click('#board [data-back]');ok(await pg.isVisible('#setup')&&(await pg.inputValue('#lvn'))=='1','Back returns to the level picker on Level 1');
// cache
const f0=srv.n.fetchLevelBoard;await pg.click('#lvboard');await pg.waitForSelector('#blist .brow.me');ok(srv.n.fetchLevelBoard===f0,'board reused for 3 minutes (no extra reads)');
ok((await pg.locator('#blist .brow.me .rk').textContent())=='2','(from the picker button too)');
// a cleaner replay improves the score: submit again, rank 1
await pg.click('#board [data-back]');await pg.click('#play');await gameOn('Level 1');
ok(JSON.parse(await A.ls('kk_prog')).att.L1===undefined,'replay starts with a clean attempt counter');
await A.solve(K.levelPuzzle(1));await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
ok((await pg.textContent('#rlist')).includes('new!'),'replay: best score marked new');
await A.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0,8000);
const e2=srv.lboard[1][uid];ok(e2.attempts===1&&e2.score<e1.score&&e2.score===e2.ms,'server entry improved to 1 attempt, lower score');
await pg.click('#rlb');await pg.waitForSelector('#blist .brow.me');
ok((await pg.locator('#blist .brow.me .rk').textContent())=='1','after the cleaner clear I am rank 1 (cache was refreshed)');
// a worse replay (with a hint) does not touch the board
const sb=srv.n.submitLevelBoard;await pg.click('#board [data-back]');await pg.click('#play');await gameOn('Level 1');
await pg.locator('#kgrid .w').first().click();await pg.click('#hintbtn');await A.solve(K.levelPuzzle(1));await pg.waitForSelector('#result:not([hidden])',{timeout:5000});
await pg.waitForTimeout(600);ok(srv.n.submitLevelBoard===sb&&srv.lboard[1][uid].score===e2.score,'a worse replay is not sent');
await pg.click('#rmenu');
// current uncleared level: board is viewable, says clear it to join
await pg.click('[data-go=play]');ok((await pg.inputValue('#lvn'))=='2','picker on Level 2');
await pg.click('#lvboard');await pg.waitForSelector('#board:not([hidden])');await pg.waitForFunction(()=>document.getElementById('bmsg').textContent!=='Loading...');
ok((await pg.textContent('#bmsg')).includes('No scores on this level yet')&&(await pg.textContent('#bmsg')).includes('Clear this level to join'),'uncleared level: empty board, invitation to clear it');
await pg.click('#board [data-back]');await pg.click('#back,#setup [data-back]');
// a second phone, same account: opening a board never creates a second entry for me
const B=await phone();await B.boot();await B.pg.click('#me .btn');await B.pg.click('#signup').catch(()=>{});
await B.pg.fill('#u','kira');await B.pg.fill('#p','secret1');await B.pg.click('#signup');await B.wait(()=>document.getElementById('home')&&!document.getElementById('home').hidden);
// kira is a brand-new account on phone B who clears Level 1 while OFFLINE-then-online, check ranking uses attempts
await B.pg.click('[data-go=play]');await B.pg.click('#play');await B.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 1'&&document.getElementById('result').hidden&&!document.getElementById('game').hidden);
await B.pg.locator('#kgrid .w').first().click();await B.pg.click('#hintbtn');await B.pg.click('#hintbtn');   // two hints
await B.solve(K.levelPuzzle(1));await B.pg.waitForSelector('#result:not([hidden])',{timeout:5000});
await B.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0,8000);
const kuid=JSON.parse(await B.ls('mock_auth')).uid,ek=srv.lboard[1][kuid];
ok(ek.hints===2&&ek.attempts===1&&ek.score===ek.ms+60000,'two hints: score = ms + 60 s');
// signed-out visitor can read the board
const C=await phone();await C.boot();await C.pg.click('[data-go=play]');await C.pg.click('#play');await C.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Level 1'&&document.getElementById('result').hidden&&!document.getElementById('game').hidden);
await C.solve(K.levelPuzzle(1));await C.pg.waitForSelector('#result:not([hidden])',{timeout:5000});await C.pg.click('#rlb');await C.pg.waitForSelector('#blist .brow');
ok((await C.pg.locator('#blist .brow').count())===6&&(await C.pg.textContent('#bmsg')).includes('Sign in or play as a guest')&&await C.pg.isVisible('#bsign'),'signed out: can read the board, is invited to sign in');
ok(JSON.parse(await C.ls('kk_out')).some(o=>o.t==='lboard'),'...and the entry waits in the queue until they sign in');
await C.pg.click('#bsign');await C.pg.click('#guest');await C.wait(()=>JSON.parse(localStorage.getItem('kk_out')||'[]').length==0,8000);
ok(Object.keys(srv.lboard[1]).length===7,'after signing in as a guest the queued entry arrived (7 players)');
// daily results do not show the level button
await B.pg.click('#rmenu');await B.pg.click('[data-go=daily]');await B.pg.click('#dlist .drow:nth-child(1)');await B.pg.waitForFunction(()=>document.getElementById('gtitle').textContent==='Daily 1'&&document.getElementById('result').hidden&&!document.getElementById('game').hidden);
await B.solve(K.dailyPuzzle(20731,0).constructor===Object?K.dailyPuzzle((await B.pg.evaluate(()=>Math.floor((Date.now()+19800000)/864e5))),0):null);await B.pg.waitForSelector('#result:not([hidden])',{timeout:6000});
ok(await B.pg.isHidden('#rlb'),'a Daily result has no level-leaderboard button');
const errs=[...A.errs,...B.errs,...C.errs];console.log(errs.length?errs.join('\n'):'no page errors');
console.log(state.bad?state.bad+' FAILED':'ALL PASSED');
await b.close();
