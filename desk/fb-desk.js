// 수첩이 쓰는 파이어베이스 손잡이를 한 곳에 모은다 (2026-11-11).
// shared/fb.js(호클래스가 쓰는 것)를 그대로 쓰고, 수첩에 더 필요한 것만 보탠다.
// 시험할 때는 이 파일만 가짜로 바꿔 끼우면 되므로 수첩 코드는 손대지 않는다.
import { db, auth, collection, getDocs, doc, getDoc, setDoc, deleteDoc,
         signInWithEmailAndPassword, onAuthStateChanged, signOut } from "../shared/fb.js";
import { GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { onSnapshot, runTransaction, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const FB = {
  db, auth,
  collection, getDocs, doc, getDoc, setDoc, deleteDoc,
  onSnapshot, runTransaction, query, where, orderBy, limit,
  signInWithEmailAndPassword, onAuthStateChanged, signOut,
  GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup,
};
