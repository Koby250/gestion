import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * Enregistre une action sensible dans la collection logs_audit
 * @param {string} actionType - Type de l'action (ex: 'RESERVATION_CREATE', 'TRANSACTION_DELETE', etc.)
 * @param {string} description - Description détaillée de l'action avec les données avant/après
 */
export const logEvent = async (actionType, description) => {
  try {
    const user = auth.currentUser;
    const adminEmail = user ? user.email : 'Système';
    
    await addDoc(collection(db, 'logs_audit'), {
      admin: adminEmail,
      action: actionType,
      description: description,
      date: new Date().toISOString()
    });
    console.log(`[Audit] ${actionType} logged successfully.`);
  } catch (error) {
    console.error(`[Audit] Erreur lors de l'enregistrement du log ${actionType}:`, error);
  }
};
