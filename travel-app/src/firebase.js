// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA_e1NgZVoS81Cx_gqy4XuVvvTybXCP2ZQ",
    authDomain: "travel-f2891.firebaseapp.com",
    projectId: "travel-f2891",
    storageBucket: "travel-f2891.firebasestorage.app",
    messagingSenderId: "742669744968",
    appId: "1:742669744968:web:0fc5f5835044701d39d17d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };