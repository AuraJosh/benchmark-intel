const admin = require('firebase-admin');

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCqxqbwMEzflKUo
8z4GC1j+2cEvKdO2oFRCIqPev3M8dn/KNr7+k52vDCdrR/8CNpuhjfntuwJjThDQ
gWLuBmUaygJZZgq59FBG9HVAfL4LnnfbxOPHTvxP184PadyNGLgZ60/GLd/SLHXk
xqqWqzx5RZtxEu7d6SovqVHZF9Ilclccez8xH+7EQ200IIURAbAx8k+eDFHtjO0u
WiiazgQ1me9zjX+i47YxcLqMb4DzXX10OlwWeACk7aP96n7LP8nWYNNeWUHwuDKB
zvsfdO1klOvnbM81VFUuaryWao+qK1dssTvlm0oSVgbz04bcAaeMrIgrPx+FaDas
qtOUMSoJAgMBAAECggEAD0XGxjI7nb8oahoe0OGQ6vHEchhWg72g6203pIMQpjae
xRHSUOgYsP/wQorkxmjl0DPnRxhzZTglDtCTbWALCLNKNH6ItQqhZ0cTeVnukRFx
/KiGClwI+ob9Oamo/MFaLY86yiluG9i4Dmap+OGFff74oMslq5jfmfWViUm1FH4Y
3aGOJjpyOS2J/gxFmk7BoW+j1h+5mXxmJvJillBnGuXHp3JWSiVgRdxVMKUTlBl8
MFHaOZEynPsKj3AsO5tnrbQJ9qHz6u0FC0mnDZON+fZEJZyO/mJpMcVJ61nmVREd
DVBScDxJcuFdH7QuwW7W3eqobSUgTZjH6YFDYfDKgQKBgQDWBnm5aYnl9eqXP4gh
ujnR1OHmwIE8gfHdx0jfJU1Zyl87K2XqCxMMA5xuhtdUGGj2M8VdW9XHmx4DfDPM
KyaxCaZv7mB9qh1wS8ad21EXbSWFdRnzKO0Vj0N1op+8df2gkiy22nsx51j9tlat
nlcvlnnlBf8LLbY88enMgscCWWQKBgQDMRMRtBfoJ3ulcVCcDhs+7wv9+fyEhr065
0jsx7ezAdqJqrHDjc2bbZPgGF+2DayKj6dc0TeY48XQYxsf3FEx+eomSA1jKs6ww
DJhQXvnK+wzE7bp7ekfn3RGJ7WEjAYkg17/jwgT7217gORtAMp2zC/dVh3hr6PoQ
PcjkJSEbMQKBgFcOt0DGP0N9LnlrbFJbz90cfO9B6s/UA7A0ud2a7MXTXb1Rv9jd
vFesuFr1Gm2oqDlNgcCh9GmHHURJp0ArZUeqJztseW9kXSkqiZX4ehnPWe3ZXj7c
rOOSLNyS0+rzC8He87VFVctM0ZQSMVvWjOPP/H66G2BoJlVxcZcg9rexAoGAXbRu
J1VGjqCjjKdN/mApi4i4i97l4/33r2axoQX0RZYmi6jvYGfgF2UKIkF3w4GyMl9j
SasyoYyiJXuK391/+cVcto6yfMpPgvtEJBptnJ/uC6jCk0JVGhhfo1Yx6U0bCuXu
MR0gDClmLJYF2j1d+nTS0XmD1Hzbufed4Irn1QECgYEAnjvkkHl+x38lO68OcZTI
e3zH6DgObkWYx8aOV4y4mY0A7U4gPsDAteRaZHMnR/1UzhuMI0wyLqOlyjQyt806
T/PR3n8WWtdhh4RljZp3X3OlicdV2XGkx3w3cEdb8hH/9h0UqiNJqKHVQluU8SzF
tmgG1MVGBHYs306cvheW8K4=
-----END PRIVATE KEY-----`;

const sourceKey = {
  "type": "service_account",
  "project_id": "benchmark-intelligence-a5b7c",
  "private_key_id": "4c9fb191f606cda883ea511750e757f46ecffda5",
  "private_key": privateKey,
  "client_email": "firebase-adminsdk-fbsvc@benchmark-intelligence-a5b7c.iam.gserviceaccount.com"
};

const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceKey)
}, 'source');

const db = sourceApp.firestore();

async function survey() {
    console.log('--- STARTING SURVEY ---');
    const collections = await db.listCollections();
    for (const c of collections) {
        const snap = await c.limit(1).get();
        console.log(`- ${c.id}: ${snap.size > 0 ? 'HAS DATA' : 'EMPTY'}`);
    }
    console.log('--- SURVEY COMPLETE ---');
    process.exit(0);
}

survey().catch(console.error);
