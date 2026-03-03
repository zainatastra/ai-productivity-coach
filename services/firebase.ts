// services/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAmZFNDQo-rUWeY8_1xyhD_g4bIeCPd9c4",
  authDomain: "ai-productivity-coach-d40b7.firebaseapp.com",
  projectId: "ai-productivity-coach-d40b7",
  storageBucket: "ai-productivity-coach-d40b7.firebasestorage.app",
  messagingSenderId: "811804232055",
  appId: "1:811804232055:web:5d18d430ec4a6dc3417972",
  measurementId: "G-8125QNWWNT"
};

// ================================
// MAIN USER APP
// ================================
export const app =
  !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp();

// ================================
// ADMIN APP (SEPARATE AUTH SESSION)
// ================================
export const adminApp =
  getApps().find(app => app.name === "adminApp") ||
  initializeApp(firebaseConfig, "adminApp");