// Firebase configuration and initialization (Modular SDK v12.1.0)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js';

const firebaseConfig = {
    apiKey: "AIzaSyAtOedXLBC4eigzqmBpYFciN-W5Mi2Cpmc",
    authDomain: "alpharia-c6a39.firebaseapp.com",
    projectId: "alpharia-c6a39",
    storageBucket: "alpharia-c6a39.firebasestorage.app",
    messagingSenderId: "85322759772",
    appId: "1:85322759772:web:d5c7a528fd61c9d2373099",
    measurementId: "G-KEC7MGMVE8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

console.log('Firebase initialized (v12.1.0 Modular)');

// Export initialized instances
export { app, auth, db, storage };
