import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBQtvqfda36OlmkbOjq6JOJ0a-s6LP4Euc",
  authDomain: "le-cercle-ef77b.firebaseapp.com",
  projectId: "le-cercle-ef77b",
  storageBucket: "le-cercle-ef77b.firebasestorage.app",
  messagingSenderId: "381028183619",
  appId: "1:381028183619:web:53030a4351a44ff6bb6ef6"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// Export de la base de données Firestore
export const db = getFirestore(app);

// Export de l'instance d'authentification
export const auth = getAuth(app);