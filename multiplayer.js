import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile,signInAnonymously,deleteUser,EmailAuthProvider,linkWithCredential,GoogleAuthProvider,signInWithPopup,linkWithPopup,signInWithCredential} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {getFirestore,initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,getDoc,setDoc,deleteDoc,writeBatch,collection,query,orderBy,limit,where,getDocs,getCountFromServer} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as fc from './firebase-config.js';

const cfg=fc.firebaseConfig||fc.default;
if(!cfg||!cfg.apiKey||!cfg.appId||!cfg.messagingSenderId)throw new Error('Firebase config is missing apiKey, messagingSenderId or appId in firebase-config.js');

const app=initializeApp(cfg),auth=getAuth(app);
// Local cache that survives closing the app: writes made offline wait in it and are sent when the connection returns.
// If the browser refuses (private mode, old browser) we fall back to the plain database; the app's own outbox still protects clears.
let db;try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(e){db=getFirestore(app)}
const mail=u=>u.toLowerCase()+'@supermania.games';

export const me=()=>auth.currentUser&&{uid:auth.currentUser.uid,name:auth.currentUser.displayName||'',anon:auth.currentUser.isAnonymous};
export const onUser=cb=>onAuthStateChanged(auth,cb);
export const signIn=(u,p)=>signInWithEmailAndPassword(auth,mail(u),p);
// Username accounts: the username is the login (stored lower-case as usernames/{name}), the password is the password.
// The same account works in every Supermania game that uses this Firebase project.
export const nameTaken=async u=>(await getDoc(doc(db,'usernames',u.toLowerCase()))).exists();
const cleanName=n=>String(n||'').trim().split(/\s+/)[0].slice(0,14);
export const signUp=async(u,p)=>{
  if(await nameTaken(u))throw {code:'auth/email-already-in-use'};
  const cu=auth.currentUser;
  if(cu&&cu.isAnonymous){
    // A guest creating an account KEEPS the same uid, so everything the guest saved stays theirs.
    const key=doc(db,'usernames',u.toLowerCase());
    try{await setDoc(key,{uid:cu.uid,name:u})}catch(e){throw {code:'auth/email-already-in-use'}}
    try{await linkWithCredential(cu,EmailAuthProvider.credential(mail(u),p))}catch(e){await deleteDoc(key).catch(()=>{});throw e}
    await updateProfile(cu,{displayName:u});
    await setDoc(doc(db,'players',cu.uid),{name:u,created:Date.now()},{merge:true}).catch(()=>{});
    return;
  }
  const c=await createUserWithEmailAndPassword(auth,mail(u),p);
  try{await setDoc(doc(db,'usernames',u.toLowerCase()),{uid:c.user.uid,name:u})}
  catch(e){await deleteUser(c.user).catch(()=>{});throw {code:'auth/email-already-in-use'}}
  await updateProfile(c.user,{displayName:u});
  await setDoc(doc(db,'players',c.user.uid),{name:u,created:Date.now()},{merge:true}).catch(()=>{});
};
// Google: a guest is linked (same uid, progress kept). If that Google account already has a Supermania account, sign in to it instead:
// the app then merges this phone's progress into it. Google accounts get their first name (14 letters at most) as the player name.
export const googleSignIn=async()=>{
  const prov=new GoogleAuthProvider(),cu=auth.currentUser;let cred;
  try{cred=cu&&cu.isAnonymous?await linkWithPopup(cu,prov):await signInWithPopup(auth,prov)}
  catch(e){
    if(e.code==='auth/credential-already-in-use'||e.code==='auth/email-already-in-use'){
      const c=GoogleAuthProvider.credentialFromError(e);if(!c)throw e;cred=await signInWithCredential(auth,c);
    }else throw e;
  }
  const user=cred.user,name=cleanName(user.displayName)||'Player';
  if(user.displayName!==name)await updateProfile(user,{displayName:name}).catch(()=>{});
  await setDoc(doc(db,'players',user.uid),{name,created:Date.now()},{merge:true}).catch(()=>{});
};
// the chosen character follows the account (field kkav, so other games' fields are left alone)
export const saveProfile=av=>{const u=auth.currentUser;return u?setDoc(doc(db,'players',u.uid),{name:u.displayName||'',kkav:av},{merge:true}):Promise.resolve()};
export const loadProfile=async()=>{const u=auth.currentUser;if(!u)return null;const s=await getDoc(doc(db,'players',u.uid));return s.exists()?s.data():null};
export const guest=async(name)=>{const c=await signInAnonymously(auth);await updateProfile(c.user,{displayName:name})};
export const logout=()=>signOut(auth);

/* ---------- progress (see firestore.rules) ----------
   kakuroProgress/{uid}                 one summary document: levels, best times, today's dailies, streak. The home screen reads only this.
   kakuroClears/{uid}/items/{L12|D20261005-3}   one record per cleared puzzle: kind, ms, attempts, hints, finished
   kakuroDaily/{YYYYMMDD}/entries/{uid}         one leaderboard entry per player per day
   A clear is ONE batched write (the item + the summary). Batches work offline: they wait in the local cache and are sent later. */
const SUM=uid=>doc(db,'kakuroProgress',uid);
export const loadSummary=async()=>{const u=auth.currentUser;if(!u)return null;const s=await getDoc(SUM(u.uid));return s.exists()?s.data():null};
export const syncClear=async({items,summary})=>{
  const u=auth.currentUser;if(!u)throw new Error('Not signed in');
  const b=writeBatch(db);
  for(const it of items)b.set(doc(db,'kakuroClears',u.uid,'items',it.pid),it.data);
  b.set(SUM(u.uid),summary);
  await b.commit();
};
export const submitBoard=async(day,d)=>{
  const u=auth.currentUser;if(!u)throw new Error('Not signed in');
  await setDoc(doc(db,'kakuroDaily',day,'entries',u.uid),{name:cleanName(d.name)||'Player',av:String(d.av||'').slice(0,8),ms:d.ms,hints:d.hints,score:d.score,day,finished:d.finished});
};
// the day's fastest players: the top n (n reads)
export const fetchBoard=async(day,n=20)=>{
  const s=await getDocs(query(collection(db,'kakuroDaily',day,'entries'),orderBy('score'),limit(n)));
  return s.docs.map(d=>({uid:d.id,...d.data()}));
};
// my place when I am not in the top n: one count query (billed as one read per 1000 entries counted)
export const myRank=async(day,score)=>{
  const c=await getCountFromServer(query(collection(db,'kakuroDaily',day,'entries'),where('score','<',score)));
  return c.data().count+1;
};

/* ---------- level leaderboards ----------
   kakuroLevels/{level}/entries/{uid}: one entry per player per level (their best score).
   score = time + 30 s per extra attempt + 30 s per hint. Lowest wins. */
export const submitLevelBoard=async(level,d)=>{
  const u=auth.currentUser;if(!u)throw new Error('Not signed in');
  await setDoc(doc(db,'kakuroLevels',String(level),'entries',u.uid),{name:cleanName(d.name)||'Player',av:String(d.av||'').slice(0,8),ms:d.ms,attempts:d.attempts,hints:d.hints,score:d.score,level,finished:d.finished});
};
export const fetchLevelBoard=async(level,n=20)=>{
  const s=await getDocs(query(collection(db,'kakuroLevels',String(level),'entries'),orderBy('score'),limit(n)));
  return s.docs.map(d=>({uid:d.id,...d.data()}));
};
export const myLevelRank=async(level,score)=>{
  const c=await getCountFromServer(query(collection(db,'kakuroLevels',String(level),'entries'),where('score','<',score)));
  return c.data().count+1;
};
