// ============================================================
// firebase.js — Point d'entrée unique Firebase pour l'application
// Projet  : barber-control
// SDK     : Firebase v12.x (Modular API)
// ============================================================

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore }                    from "firebase/firestore";
import { getAuth }                         from "firebase/auth";

// ---------------------------------------------------------------------------
// Configuration du projet Firebase
// AVERTISSEMENT : ne jamais commiter les clés dans un dépôt public.
// Utilisez des variables d'environnement (.env) pour la production.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey:            "AIzaSyCNG4DVxjzNXLhFSuvA0rwHuWkHTM757LY",
  authDomain:        "barber-control-fac68.firebaseapp.com",
  projectId:         "barber-control-fac68",
  storageBucket:     "barber-control-fac68.appspot.com",
  messagingSenderId: "927192202405",
  appId:             "1:927192202405:web:507bd13fb904a3e1f7614c",
};

// ---------------------------------------------------------------------------
// Initialisation — singleton : évite l'erreur "Firebase App named '[DEFAULT]'
// already exists" en cas de Hot Module Replacement (Vite HMR).
// ---------------------------------------------------------------------------
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// ---------------------------------------------------------------------------
// Exports nommés — importez directement { db } ou { auth } dans vos composants
//   import { db }   from '../firebase';
//   import { auth } from '../firebase';
// ---------------------------------------------------------------------------

/** Instance Firestore — base de données temps réel */
export const db = getFirestore(app);

/** Instance Authentication — gestion des sessions utilisateurs */
export const auth = getAuth(app);

/** Instance Firebase principale — nécessaire pour créer des apps secondaires */
export { app };