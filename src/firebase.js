import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCNG4DVXjzNXLhFSuva0rwHuWkHM757LY",
  authDomain: "barber-control-fac68.firebaseapp.com",
  projectId: "barber-control-fac68",
  storageBucket: "barber-control-fac68.appspot.com",
  messagingSenderId: "927192202405",
  appId: "1:927192202405:web:507bd13fb904a3e1f7614c"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);