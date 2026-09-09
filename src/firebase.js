import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore }                    from "firebase/firestore";
import { getAuth }                         from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyCNG4DVxjzNXLhFSuvA0rwHuWkHTM757LY",
  authDomain:        "barber-control-fac68.firebaseapp.com",
  projectId:         "barber-control-fac68",
  storageBucket:     "barber-control-fac68.appspot.com",
  messagingSenderId: "927192202405",
  appId:             "1:927192202405:web:507bd13fb904a3e1f7614c",
};


const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();


/** Instance Firestore — base de données temps réel */
export const db = getFirestore(app);

/** Instance Authentication — gestion des sessions utilisateurs */
export const auth = getAuth(app);

/** Instance Firebase principale — nécessaire pour créer des apps secondaires */
export { app };