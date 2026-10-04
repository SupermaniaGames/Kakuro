import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile,signInAnonymously,deleteUser} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as fc from './firebase-config.js';

const cfg=fc.firebaseConfig||fc.default;
if(!cfg||!cfg.apiKey||!cfg.appId||!cfg.messagingSenderId)throw new Error('Firebase config is missing apiKey, messagingSenderId or appId in firebase-config.js');

const app=initializeApp(cfg),auth=getAuth(app),db=getFirestore(app);
const mail=u=>u.toLowerCase()+'@supermania.games';

export const me=()=>auth.currentUser&&{uid:auth.currentUser.uid,name:auth.currentUser.displayName||''};
export const onUser=cb=>onAuthStateChanged(auth,cb);
export const signIn=(u,p)=>signInWithEmailAndPassword(auth,mail(u),p);
// Username accounts: the username is the login (stored lower-case as usernames/{name}), the password is the password.
// The same account works in every Supermania game that uses this Firebase project.
export const nameTaken=async u=>(await getDoc(doc(db,'usernames',u.toLowerCase()))).exists();
export const signUp=async(u,p)=>{
  if(await nameTaken(u))throw {code:'auth/email-already-in-use'};
  const c=await createUserWithEmailAndPassword(auth,mail(u),p);
  try{await setDoc(doc(db,'usernames',u.toLowerCase()),{uid:c.user.uid,name:u})}
  catch(e){await deleteUser(c.user).catch(()=>{});throw {code:'auth/email-already-in-use'}}
  await updateProfile(c.user,{displayName:u});
  await setDoc(doc(db,'players',c.user.uid),{name:u,created:Date.now()},{merge:true}).catch(()=>{});
};
// the chosen character follows the account (field kkav, so other games' fields are left alone)
export const saveProfile=av=>{const u=auth.currentUser;return u?setDoc(doc(db,'players',u.uid),{name:u.displayName||'',kkav:av},{merge:true}):Promise.resolve()};
export const loadProfile=async()=>{const u=auth.currentUser;if(!u)return null;const s=await getDoc(doc(db,'players',u.uid));return s.exists()?s.data():null};
export const guest=async(name)=>{const c=await signInAnonymously(auth);await updateProfile(c.user,{displayName:name})};
export const logout=()=>signOut(auth);

// Step 3 adds the progress functions here (saveClear, loadSummary, ...). Rooms, lobby and chat are gone: Kakuro is single player.
