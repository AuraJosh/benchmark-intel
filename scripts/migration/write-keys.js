const fs = require('fs');
const path = require('path');

// THE SOURCE KEY (benchmark-intelligence-a5b7c)
const sourcePk = `-----BEGIN PRIVATE KEY-----
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

// THE DESTINATION KEY (benchmark-intel-3ea4a)
const destPk = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCthlTNbEULXtzi
3iRpY8eJ0vIw5bHY25F8qv0TTYvXpQurKqVmSCTI4ogPv7WnEQAU5BMsRaSExxJa
En14Fv4gLnIyea7Qh8nFbsWq4SUMef1D8IsQV9DSi99RHiG9dDK96pn5XIaTPgpm
xkTL1TXZk+J/kuWBH22OSWpUByxI07JEaUrhFfjMwPykNBvV6v72wkiO0IqnALHM
1mHeCP7XJHHRI74GGenRskl0YZttzxv2tE2qgO77ZaWeg759gVat6O5/VSVswNut
p4V21Bv34Tg9uBA0vqKYM/tdlZsZxsz9e/btRmjms5YNRD5UGLti1fgwDg9ds+tt
AjomJxh3AgMBAAECggEABgq9ACwYRxEBcu0WM584Slm+MPPPo7GY61BFst9vSU3a
O81LQ8GGUTkvLBE1uBLU9q5leMrx/Jwiuqm6AtIWIZBMclgxmJDFP9iNMiDFw2aF
ahpmHlQz3rIJqurl4FdsqZ2LeMTFMj6BHQ8J//olStbixl6qUX0OdEou/whYdNw
NzxjUmKhVQlZk8TIiMNmtCkApVaZFBCLcd8Xw5t2iA7dMSyoFzY4TTYdAURwWJrF
va3x8ZTu5lE2At6+qBBQPYvOxXwVpMgWyjM4e/2ashER4fDjTBnlQ2KL1b/T6Ba2
npNgPht+cSbexjzzYX8gPkKMs8w+KdaUnoaoxeakrRQKBgQDa6ReZUle1d6yQV32e
nu1pl6odPY+hmoaAHPvQ0z85Wb3exLFIw8Bhkc5nOGixV87l7y0z+HYf761y/8NNd
zY+Ubpg3UNLqarKT9cgs9+EZmwdlQSnAElridHZS4eVRd+9v6e6iMtqR2l2o+xJR
uTm5v6NsUC2RTUEKGR68TBj1hQKBgQDK7LNF0g9hiinOQ77gbEyoMalIH8wONvU7
MfeQch8DM3S+ZVKE3wADUeKLVhJQEtYQ0UgNnU0hhw0t8veQijy+snoFOODF0Btj
zex9pVCbfkCh0uuwYgqePG1VHKo+gMwOBuqOS4CNYJ8OX7nhgiZC+LRBZ5tX+Oq+
ZN9VQcNIywKBgCRMcEhRGhASFwAcMc1HPbcWi3dDlr6l4DYzXyT+rDUy6ILtWXeZ
6EGH1aISPvXFoyT+0fZ1CR5hqZB+K14rfrpbGExbz41lQdU89QNX2vB2/2PvyS97
G6zfKNuXb4HxxDcncBVfH1T+A3fIogIBF6xQNZX5OYUVbUpyXeFVMPJNAoGAPprW
GDVdb29LxIocCmr/H2jq3AiLUNtdvxyETzkWHkuyucbStZGDFIMfzHMKhU+6YUff
3etoz241/7YU8K/lW8P+ZzwMBJtWx+zRCFaHTuGdmQ9UjX9B3V2xMW/9ifj8e1tg
4/OhPnzPtYSM+WjI2yKVohQP1g1ChujiChCW6g8CgYALBTqnFbQPT4GX6ucLoa1x
vJo8lYdcb9FE+RI/TXOrk2R6qCmNcc9x3XLdbS0uZ5tMjkoZOvmYPrsDa7GKcF1g
2gRjakyBjC0vpoY1Zpi52Npz1eZXDbh54oXKLPapy7jZBf0GzJrQ/LFAD8I9n4wx
DJJs66m9Ut3TyXiOfmK+cg==
-----END PRIVATE KEY-----`;

const sourceKey = {
  "type": "service_account",
  "project_id": "benchmark-intelligence-a5b7c",
  "private_key_id": "4c9fb191f606cda883ea511750e757f46ecffda5",
  "private_key": sourcePk,
  "client_email": "firebase-adminsdk-fbsvc@benchmark-intelligence-a5b7c.iam.gserviceaccount.com"
};

const destKey = {
  "type": "service_account",
  "project_id": "benchmark-intel-3ea4a",
  "private_key_id": "70a2824b2cfb750ab5d328e18361af4a8931c865",
  "private_key": destPk,
  "client_email": "firebase-adminsdk-fbsvc@benchmark-intel-3ea4a.iam.gserviceaccount.com"
};

fs.writeFileSync('source-key.json', JSON.stringify(sourceKey, null, 2));
fs.writeFileSync('destination-key.json', JSON.stringify(destKey, null, 2));
console.log('Keys written with literal newlines.');
