importScripts('https://www.gstatic.com/firebasejs/9.1.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.1.3/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCdOlf6temSVvSSrdLyOEIWYpSDjqv58-w",
  authDomain: "benchmark-intel-3ea4a.firebaseapp.com",
  projectId: "benchmark-intel-3ea4a",
  storageBucket: "benchmark-intel-3ea4a.firebasestorage.app",
  messagingSenderId: "670600140524",
  appId: "1:670600140524:web:5acaf97b6bc197f2bfb7c9"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // We no longer call self.registration.showNotification here because 
  // Firebase automatically handles the visual banner when the 'notification' 
  // object is present in the payload.
});
