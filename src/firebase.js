import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export default app;
