// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyDByLT7q0xmACKJ_nvP_swJbEsyMpkKC6w",
  authDomain: "topdow-action.firebaseapp.com",
  projectId: "topdow-action",
  storageBucket: "topdow-action.firebasestorage.app",
  messagingSenderId: "772431362539",
  appId: "1:772431362539:web:305274652866781b4ac1ae",
  measurementId: "G-WE6BNKQMQ6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

console.log('🔥 Firebase initialized — project: topdow-action');