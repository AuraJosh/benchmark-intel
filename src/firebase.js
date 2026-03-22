import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getVertexAI } from "@firebase/vertexai";

const firebaseConfig = {
  apiKey: "AIzaSyCdOlf6temSVvSSrdLyOEIWYpSDjqv58-w",
  authDomain: "benchmark-intel-3ea4a.firebaseapp.com",
  projectId: "benchmark-intel-3ea4a",
  storageBucket: "benchmark-intel-3ea4a.firebasestorage.app",
  messagingSenderId: "670600140524",
  appId: "1:670600140524:web:5acaf97b6bc197f2bfb7c9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app); // Switched to default database
export const storage = getStorage(app);
export const vertexAI = getVertexAI(app, { location: 'us-central1' });
export default app;
