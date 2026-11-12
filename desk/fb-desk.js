// 시험할 때는 이 파일만 가짜로 바꿔 끼운다.
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
