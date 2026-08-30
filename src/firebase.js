import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCNG4DVxjzNXLhFSuvA0rwHuWkHTM757LY",
  authDomain: "barber-control-fac68.firebaseapp.com",
  projectId: "barber-control-fac68",
  storageBucket: "barber-control-fac68.firebasestorage.app",
  messagingSenderId: "927192202405",
  appId: "1:927192202405:web:507bd13fb904a3e1f7614c"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// Export de la base de données Firestore
export const db = getFirestore(app);

// Export de l'instance d'authentification
export const auth = getAuth(app);