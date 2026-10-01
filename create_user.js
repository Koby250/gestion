import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDh3UEsrvpiu5zleNchHTTx50hWa-IFrpw",
  authDomain: "gestion-212d0.firebaseapp.com",
  projectId: "gestion-212d0",
  storageBucket: "gestion-212d0.firebasestorage.app",
  messagingSenderId: "918853109503",
  appId: "1:918853109503:web:c8deaf9de63adf483faeca"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = "jaloud@gmail.com";
const password = "Gestion2026!";

async function createUser() {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("SUCCESS: User created successfully with UID:", userCredential.user.uid);
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error.code, error.message);
    process.exit(1);
  }
}

createUser();
