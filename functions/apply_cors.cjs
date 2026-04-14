const admin = require('firebase-admin');

async function applyCors() {
  try {
    const app = admin.initializeApp({
      storageBucket: 'benchmark-intel-3ea4a.firebasestorage.app'
    });
    
    const bucket = app.storage().bucket();
    
    const corsConfiguration = [
      {
        origin: ['*'],
        method: ['GET', 'OPTIONS'],
        maxAgeSeconds: 3600
      }
    ];

    await bucket.setCorsConfiguration(corsConfiguration);
    console.log('CORS configuration applied successfully.');
  } catch (err) {
    console.error('Error applying CORS:', err);
  }
}

applyCors();
