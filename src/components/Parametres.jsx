import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth, app } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { Archive, CheckCircle, Plus, Edit2, Trash2, Save, X, UserPlus, ShieldCheck, Eye, EyeOff, Palette, Sun, Moon } from 'lucide-react';
import { logEvent } from '../utils/audit';
import BulkActionBar from './BulkActionBar';
import { computeGlobalPoints } from '../utils/points';

const Parametres = ({ accentTheme = 'monochrome', onAccentChange, theme = 'dark', onThemeChange }) => {
  // Collection States
  const [services, setServices] = useState([]);
  const [servicesDomicile, setServicesDomicile] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);

  
  // Daily & Monthly Goal State
  const [dailyGoal,    setDailyGoal]    = useState('');
  const [monthlyGoal,  setMonthlyGoal]  = useState('');
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [globalPoints, setGlobalPoints] = useState({});
  const [isGoalSaving, setIsGoalSaving] = useState(false);

  // Admin creation state
  const [adminEmail,    setAdminEmail]    = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminRole,     setAdminRole]     = useState('agent');
  const [adminLoading,  setAdminLoading]  = useState(false);
  const [adminMsg,      setAdminMsg]      = useState(null); // { type: 'success'|'error', text }

  // Users state
  const [usersList, setUsersList] = useState([]);

  // Forms States (Add)
  const [newService, setNewService] = useState({ nom: '', prix: '' });
  const [newServiceDomicile, setNewServiceDomicile] = useState({ nom: '', prix: '' });
  const [newCategory, setNewCategory] = useState({ nom: '' });
  const MODULES_AGENTS = [
    { key: 'accesCaisse',       label: 'Caisse' },
    { key: 'accesReservations', label: 'Reservations' },
    { key: 'accesInventaire',   label: 'Inventaire' },
    { key: 'accesTresorerie',   label: 'Tresorerie' },
    { key: 'accesBilan',        label: 'Bilan' },
    { key: 'accesClients',      label: 'Clients' },
    { key: 'accesParametres',   label: 'Parametres' },
  ];

  const [newEmploye, setNewEmploye] = useState({ nom: '', role: '', categorie: 'Prestataire', salaire: '' });
  const [newCharge, setNewCharge] = useState({ nom: '', montant: '' });


  // Edit States
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editServiceForm, setEditServiceForm] = useState({ nom: '', prix: '' });

  const [editingServiceDomicileId, setEditingServiceDomicileId] = useState(null);
  const [editServiceDomicileForm, setEditServiceDomicileForm] = useState({ nom: '', prix: '' });

  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ nom: '' });

  const [editingEmployeId, setEditingEmployeId] = useState(null);
  const [editEmployeForm, setEditEmployeForm] = useState({ nom: '', role: '', categorie: 'Prestataire', salaire: '' });

  const [editingChargeId, setEditingChargeId] = useState(null);
  const [editChargeForm, setEditChargeForm] = useState({ nom: '', montant: '' });



  // Bulk Selection States
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedServicesDomicile, setSelectedServicesDomicile] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedEmployes, setSelectedEmployes] = useState([]);
  const [selectedCharges, setSelectedCharges] = useState([]);

  // Load Data
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubServicesDomicile = onSnapshot(collection(db, 'services_domicile'), (snapshot) => {
      setServicesDomicile(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    const unsubCategories = onSnapshot(collection(db, 'depenses_categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubEmployes = onSnapshot(collection(db, 'employes'), (snapshot) => {
      setEmployes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), (snapshot) => {
      setChargesFixes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.objectifJournalier) setDailyGoal(data.objectifJournalier);
        if (data.objectifMensuel)    setMonthlyGoal(data.objectifMensuel);
      }
    });

    // Fetch transactions for the current month to calculate remaining goal
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    
    // We fetch all transactions to filter by month and compute global points
    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      let rev = 0;
      const allTxs = [];
      snapshot.docs.forEach(d => {
        const t = d.data();
        allTxs.push(t);
        if (t.type === 'prestation' && t.date >= startOfMonth && t.date <= endOfMonth) {
          rev += Number(t.montant);
        }
      });
      setMonthRevenue(rev);
      setGlobalPoints(computeGlobalPoints(allTxs));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });



    return () => {
      unsubServices();
      unsubServicesDomicile();
      unsubCategories();
      unsubEmployes();
      unsubSettings();
      unsubTransactions();
      unsubCharges();
      unsubUsers();

    };
  }, []);

  // Handlers Add
  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.nom || !newService.prix) return;
    await addDoc(collection(db, 'services'), { nom: newService.nom, prixDefaut: Number(newService.prix), actif: true });
    setNewService({ nom: '', prix: '' });
  };

  const handleAddServiceDomicile = async (e) => {
    e.preventDefault();
    if (!newServiceDomicile.nom || !newServiceDomicile.prix) return;
    await addDoc(collection(db, 'services_domicile'), { nom: newServiceDomicile.nom, prixDefaut: Number(newServiceDomicile.prix), actif: true });
    setNewServiceDomicile({ nom: '', prix: '' });
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.nom) return;
    await addDoc(collection(db, 'depenses_categories'), { nom: newCategory.nom, actif: true });
    setNewCategory({ nom: '' });
  };

  const handleAddEmploye = async (e) => {
    e.preventDefault();
    if (!newEmploye.nom || !newEmploye.role) return;
    await addDoc(collection(db, 'employes'), {
      nom: newEmploye.nom, role: newEmploye.role, categorie: newEmploye.categorie,
      salaireFixe: Number(newEmploye.salaire) || 0, actif: true
    });
    setNewEmploye({ nom: '', role: '', categorie: 'Prestataire', salaire: '' });
  };



  const handleAddCharge = async (e) => {
    e.preventDefault();
    if (!newCharge.nom || !newCharge.montant) return;
    await addDoc(collection(db, 'charges_fixes'), {
      nom: newCharge.nom, montant: Number(newCharge.montant), actif: true
    });
    setNewCharge({ nom: '', montant: '' });
  };

  // Handlers Goal
  const handleSaveGoal = async () => {
    setIsGoalSaving(true);
    await setDoc(doc(db, 'settings', 'general'), { 
      objectifJournalier: Number(dailyGoal),
      objectifMensuel: Number(monthlyGoal)
    }, { merge: true });
    setIsGoalSaving(false);
  };

  // Création d'un admin secondaire sans déconnecter la session principale
  // On utilise une SecondaryApp Firebase isolée pour ne pas perturber auth principal
  const handleCreateAdmin = async () => {
    if (!adminEmail || !adminPassword) {
      setAdminMsg({ type: 'error', text: 'Veuillez renseigner un email et un mot de passe.' });
      return;
    }
    if (adminPassword.length < 6) {
      setAdminMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    setAdminLoading(true);
    setAdminMsg(null);
    try {
      // App Firebase temporaire isolée pour ne pas déconnecter l'admin actuel
      // On utilise les options de l'app principale exportée depuis firebase.js
      const secondaryApp  = initializeApp(app.options, 'SecondaryAdminApp_' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, adminPassword);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: adminEmail,
        role: adminRole,
        actif: true,
        createdAt: new Date().toISOString()
      });

      await secondaryAuth.signOut();

      setAdminMsg({ type: 'success', text: `Compte créé avec succès pour ${adminEmail}. Il peut maintenant se connecter.` });
      setAdminEmail('');
      setAdminPassword('');
      setAdminRole('agent');
      console.log('[Parametres] Utilisateur créé:', adminEmail);
    } catch (err) {
      console.error('[Parametres] Erreur création admin:', err.code);
      const messages = {
        'auth/email-already-in-use': 'Cet email est déjà utilisé par un compte existant.',
        'auth/invalid-email':        'L\'adresse email n\'est pas valide.',
        'auth/weak-password':        'Le mot de passe est trop faible (min. 6 caractères).',
      };
      setAdminMsg({ type: 'error', text: messages[err.code] || `Erreur : ${err.message}` });
    } finally {
      setAdminLoading(false);
    }
  };

  // Bulk Selection Helpers
  const toggleSelection = (id, selected, setSelected) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleAll = (e, list, setSelected) => {
    if (e.target.checked) setSelected(list.map(item => item.id));
    else setSelected([]);
  };

  // Handlers Global Settings)
  const startEditService = (service) => {
    setEditingServiceId(service.id);
    setEditServiceForm({ nom: service.nom, prix: service.prixDefaut.toString() });
  };
  const saveEditService = async (id) => {
    await updateDoc(doc(db, 'services', id), { nom: editServiceForm.nom, prixDefaut: Number(editServiceForm.prix) });
    await logEvent('PARAMETRE_UPDATE', `Modification du service: ${editServiceForm.nom} (${editServiceForm.prix} FCFA)`);
    setEditingServiceId(null);
  };

  const startEditServiceDomicile = (service) => {
    setEditingServiceDomicileId(service.id);
    setEditServiceDomicileForm({ nom: service.nom, prix: service.prixDefaut.toString() });
  };
  const saveEditServiceDomicile = async (id) => {
    await updateDoc(doc(db, 'services_domicile', id), { nom: editServiceDomicileForm.nom, prixDefaut: Number(editServiceDomicileForm.prix) });
    await logEvent('PARAMETRE_UPDATE', `Modification du service à domicile: ${editServiceDomicileForm.nom} (${editServiceDomicileForm.prix} FCFA)`);
    setEditingServiceDomicileId(null);
  };

  // Handlers Edit (Category)
  const startEditCategory = (cat) => {
    setEditingCategoryId(cat.id);
    setEditCategoryForm({ nom: cat.nom });
  };
  const saveEditCategory = async (id) => {
    await updateDoc(doc(db, 'depenses_categories', id), { nom: editCategoryForm.nom });
    await logEvent('PARAMETRE_UPDATE', `Modification de la catégorie: ${editCategoryForm.nom}`);
    setEditingCategoryId(null);
  };

  // Handlers Edit (Employes)
  const startEditEmploye = (emp) => {
    setEditingEmployeId(emp.id);
    setEditEmployeForm({ 
      nom: emp.nom || '', 
      role: emp.role || '', 
      categorie: emp.categorie || 'Prestataire', 
      salaire: emp.salaireFixe !== undefined ? emp.salaireFixe.toString() : ''
    });
  };
  const saveEditEmploye = async (id) => {
    try {
      await updateDoc(doc(db, 'employes', id), { 
        nom: editEmployeForm.nom, 
        role: editEmployeForm.role, 
        categorie: editEmployeForm.categorie, 
        salaireFixe: Number(editEmployeForm.salaire) || 0
      });
      setEditingEmployeId(null);
    } catch (error) {
      console.error("Erreur lors de la modification de l'employé:", error);
      alert("Une erreur est survenue lors de l'enregistrement.");
    }
  };

  // Handlers Edit (Charges Fixes)
  const startEditCharge = (charge) => {
    setEditingChargeId(charge.id);
    setEditChargeForm({ nom: charge.nom, montant: charge.montant.toString() });
  };
  const saveEditCharge = async (id) => {
    await updateDoc(doc(db, 'charges_fixes', id), { nom: editChargeForm.nom, montant: Number(editChargeForm.montant) || 0 });
    setEditingChargeId(null);
  };



  // Handlers Status / Delete
  const toggleStatus = async (collectionName, id, currentStatus) => {
    await updateDoc(doc(db, collectionName, id), { actif: !currentStatus });
  };
  const handleDelete = async (collectionName, id) => {
    if (window.confirm("Voulez-vous vraiment supprimer cet élément définitivement ?")) {
      await deleteDoc(doc(db, collectionName, id));
    }
  };

  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1;
  const remainingAmount = Math.max(0, Number(monthlyGoal) - monthRevenue);
  const dailyTarget = daysLeft > 0 ? Math.round(remainingAmount / daysLeft) : 0;
  const progressPct = Number(monthlyGoal) > 0 ? Math.min((monthRevenue / Number(monthlyGoal)) * 100, 100) : 0;

  return (
    <div className="view-container">
      
      {/* ── COULEUR D'ACCENT & APPARENCE ───────────────────────────────── */}
      <div className="card">
        <h2 className="card-title" style={{ margin: 0, paddingBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Palette size={20} color="var(--accent-color)" />
          Thème &amp; Apparence
        </h2>

        {/* Sélecteur de Mode Sombre / Clair */}
        <div style={{ margin: '16px 0 24px' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Mode d'affichage
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <button
              type="button"
              onClick={() => onThemeChange && onThemeChange('dark')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px 18px',
                borderRadius: '14px',
                border: theme === 'dark' ? '2px solid #FFFFFF' : '1px solid var(--border-color)',
                backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'var(--bg-input)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: theme === 'dark' ? '0 0 20px rgba(255,255,255,0.15)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                backgroundColor: '#000000', border: '1.5px solid #FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF', flexShrink: 0
              }}>
                <Moon size={20} />
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Mode Sombre</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Fond noir profond, boutons blancs &amp; textes éclatants
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onThemeChange && onThemeChange('light')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px 18px',
                borderRadius: '14px',
                border: theme === 'light' ? '2px solid #000000' : '1px solid var(--border-color)',
                backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'var(--bg-input)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: theme === 'light' ? '0 0 20px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                backgroundColor: '#FFFFFF', border: '1.5px solid #000000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000000', flexShrink: 0
              }}>
                <Sun size={20} />
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Mode Clair</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Version blanche, boutons noirs &amp; contrastes nets
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Nuances d'accent optionnelles */}
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Palette &amp; Accent
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              { key: 'monochrome', label: 'Noir & Blanc Pur (Le Cercle)', color: theme === 'light' ? '#000000' : '#FFFFFF', badge: 'Officiel' },
              { key: 'blue', label: 'Bleu Royal / Saphir', color: '#3B82F6' },
              { key: 'emerald', label: 'Émeraude Moderne', color: '#10B981' },
              { key: 'violet', label: 'Violet Impérial', color: '#8B5CF6' },
              { key: 'cyan', label: 'Cyan Électrique', color: '#06B6D4' },
              { key: 'slate', label: 'Titane / Ardoise', color: '#64748B' },
            ].map(palette => {
              const isSelected = (accentTheme || 'monochrome') === palette.key;
              return (
                <button
                  key={palette.key}
                  type="button"
                  onClick={() => onAccentChange && onAccentChange(palette.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    border: isSelected ? `2px solid ${palette.color}` : '1px solid var(--border-color)',
                    backgroundColor: isSelected ? 'var(--bg-elevated)' : 'var(--bg-input)',
                    color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: isSelected ? '700' : '500',
                    boxShadow: isSelected ? `0 0 16px ${palette.color}40` : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: palette.color, display: 'inline-block', border: '1px solid var(--border-color)', boxShadow: `0 0 8px ${palette.color}80` }} />
                  <span>{palette.label}</span>
                  {palette.badge && (
                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-main)', fontWeight: '700', border: '1px solid var(--border-color)' }}>
                      {palette.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* OBJECTIFS & CALCULATEUR */}
      <div className="card">
        <h2 className="card-title">Objectifs & Réréajustement</h2>
        
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
            <label>Objectif Mensuel (FCFA)</label>
            <input 
              type="number" 
              className="input-control" 
              placeholder="ex: 1000000" 
              value={monthlyGoal} 
              onChange={(e) => setMonthlyGoal(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
            <label>Objectif Journalier Fixe (FCFA)</label>
            <input 
              type="number" 
              className="input-control" 
              placeholder="ex: 50000" 
              value={dailyGoal} 
              onChange={(e) => setDailyGoal(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={handleSaveGoal} className="btn btn-primary" style={{ height: '42px' }}>
              {isGoalSaving ? 'Enregistrement...' : <><Save size={18} /> Sauvegarder</>}
            </button>
          </div>
        </div>

        {/* Calculateur Intelligent */}
        {Number(monthlyGoal) > 0 && (
          <div style={{ backgroundColor: 'var(--bg-input)', padding: '20px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-main)', marginBottom: '15px' }}>Calculateur de Cible Journalière (Mois en cours)</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Progression (CA Actuel)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {monthRevenue.toLocaleString('fr-FR')} FCFA <span style={{ fontSize: '0.9rem' }}>({Math.round(progressPct)}%)</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', marginTop: '5px' }}>
                  <div style={{ height: '100%', width: `${progressPct}%`, backgroundColor: 'var(--success)', borderRadius: '4px' }}></div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Reste à réaliser</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                  {remainingAmount.toLocaleString('fr-FR')} FCFA
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {daysLeft} jour(s) restant(s)
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 15px', borderRadius: '8px', borderLeft: '4px solid var(--accent-color)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nouveau Cible Jour</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                  {dailyTarget.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION SERVICES */}
      <div className="card">
        <h2 className="card-title">Prestations & Services</h2>
        
        <form onSubmit={handleAddService} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="input-control" 
            placeholder="Nom du service" 
            value={newService.nom} 
            onChange={(e) => setNewService({...newService, nom: e.target.value})}
            style={{ flex: 1, minWidth: '150px' }}
          />
          <input 
            type="number" 
            className="input-control" 
            placeholder="Prix (FCFA)" 
            value={newService.prix} 
            onChange={(e) => setNewService({...newService, prix: e.target.value})}
            style={{ width: '150px' }}
          />
          <button type="submit" className="btn btn-primary"><Plus size={18} /> Ajouter</button>
        </form>

        <BulkActionBar 
          selectedIds={selectedServices} 
          collectionName="services" 
          onClearSelection={() => setSelectedServices([])} 
        />
        {services.length > 0 && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="selectAllServices" onChange={e => toggleAll(e, services, setSelectedServices)} checked={services.length > 0 && selectedServices.length === services.length} style={{ cursor: 'pointer' }} />
            <label htmlFor="selectAllServices" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Tout sélectionner</label>
          </div>
        )}

        <div className="list-container">
          {services.map(service => (
            <div key={service.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', backgroundColor: selectedServices.includes(service.id) ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              
              <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleSelection(service.id, selectedServices, setSelectedServices)} style={{ cursor: 'pointer', marginRight: '5px' }} />

              {editingServiceId === service.id ? (
                <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                  <input type="text" className="input-control" value={editServiceForm.nom} onChange={e => setEditServiceForm({...editServiceForm, nom: e.target.value})} />
                  <input type="number" className="input-control" value={editServiceForm.prix} onChange={e => setEditServiceForm({...editServiceForm, prix: e.target.value})} style={{ width: '100px' }} />
                  <button onClick={() => saveEditService(service.id)} className="btn btn-success btn-small"><CheckCircle size={14} /></button>
                  <button onClick={() => setEditingServiceId(null)} className="btn btn-small" style={{background:'var(--bg-input)'}}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 'bold', color: service.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>{service.nom}</span>
                  <span style={{ marginLeft: '10px', color: 'var(--accent-color)', fontWeight: 'bold' }}>{service.prixDefaut} FCFA</span>
                  {!service.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                </div>
              )}

              {editingServiceId !== service.id && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditService(service)} className="btn btn-small" style={{backgroundColor: 'var(--bg-input)', color: 'var(--text-main)'}} title="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => toggleStatus('services', service.id, service.actif)} className={`btn btn-small ${service.actif ? 'btn-danger' : 'btn-success'}`} title={service.actif ? "Archiver" : "Activer"}>
                    {service.actif ? <Archive size={14}/> : <CheckCircle size={14}/>}
                  </button>
                  <button onClick={() => handleDelete('services', service.id)} className="btn btn-small btn-danger" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION SERVICES À DOMICILE */}
      <div className="card">
        <h2 className="card-title">Prestations & Services (À domicile)</h2>
        
        <form onSubmit={handleAddServiceDomicile} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="input-control" 
            placeholder="Nom du service (domicile)" 
            value={newServiceDomicile.nom} 
            onChange={(e) => setNewServiceDomicile({...newServiceDomicile, nom: e.target.value})}
            style={{ flex: 1, minWidth: '150px' }}
          />
          <input 
            type="number" 
            className="input-control" 
            placeholder="Prix (FCFA)" 
            value={newServiceDomicile.prix} 
            onChange={(e) => setNewServiceDomicile({...newServiceDomicile, prix: e.target.value})}
            style={{ width: '150px' }}
          />
          <button type="submit" className="btn btn-primary"><Plus size={18} /> Ajouter</button>
        </form>

        <BulkActionBar 
          selectedIds={selectedServicesDomicile} 
          collectionName="services_domicile" 
          onClearSelection={() => setSelectedServicesDomicile([])} 
        />
        {servicesDomicile.length > 0 && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="selectAllServicesDomicile" onChange={e => toggleAll(e, servicesDomicile, setSelectedServicesDomicile)} checked={servicesDomicile.length > 0 && selectedServicesDomicile.length === servicesDomicile.length} style={{ cursor: 'pointer' }} />
            <label htmlFor="selectAllServicesDomicile" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Tout sélectionner</label>
          </div>
        )}

        <div className="list-container">
          {servicesDomicile.map(service => (
            <div key={service.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', backgroundColor: selectedServicesDomicile.includes(service.id) ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              
              <input type="checkbox" checked={selectedServicesDomicile.includes(service.id)} onChange={() => toggleSelection(service.id, selectedServicesDomicile, setSelectedServicesDomicile)} style={{ cursor: 'pointer', marginRight: '5px' }} />

              {editingServiceDomicileId === service.id ? (
                <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                  <input type="text" className="input-control" value={editServiceDomicileForm.nom} onChange={e => setEditServiceDomicileForm({...editServiceDomicileForm, nom: e.target.value})} />
                  <input type="number" className="input-control" value={editServiceDomicileForm.prix} onChange={e => setEditServiceDomicileForm({...editServiceDomicileForm, prix: e.target.value})} style={{ width: '100px' }} />
                  <button onClick={() => saveEditServiceDomicile(service.id)} className="btn btn-success btn-small"><CheckCircle size={14} /></button>
                  <button onClick={() => setEditingServiceDomicileId(null)} className="btn btn-small" style={{background:'var(--bg-input)'}}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 'bold', color: service.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>{service.nom}</span>
                  <span style={{ marginLeft: '10px', color: 'var(--accent-color)', fontWeight: 'bold' }}>{service.prixDefaut} FCFA</span>
                  {!service.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                </div>
              )}

              {editingServiceDomicileId !== service.id && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditServiceDomicile(service)} className="btn btn-small" style={{backgroundColor: 'var(--bg-input)', color: 'var(--text-main)'}} title="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => toggleStatus('services_domicile', service.id, service.actif)} className={`btn btn-small ${service.actif ? 'btn-danger' : 'btn-success'}`} title={service.actif ? "Archiver" : "Activer"}>
                    {service.actif ? <Archive size={14}/> : <CheckCircle size={14}/>}
                  </button>
                  <button onClick={() => handleDelete('services_domicile', service.id)} className="btn btn-small btn-danger" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION CATÉGORIES DE DÉPENSES */}
      <div className="card">
        <h2 className="card-title">Catégories de dépenses</h2>
        
        <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="input-control" 
            placeholder="Nom de la catégorie" 
            value={newCategory.nom} 
            onChange={(e) => setNewCategory({...newCategory, nom: e.target.value})}
            style={{ flex: 1, minWidth: '150px' }}
          />
          <button type="submit" className="btn btn-primary"><Plus size={18} /> Ajouter</button>
        </form>

        <BulkActionBar 
          selectedIds={selectedCategories} 
          collectionName="depenses_categories" 
          onClearSelection={() => setSelectedCategories([])} 
        />
        {categories.length > 0 && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="selectAllCategories" onChange={e => toggleAll(e, categories, setSelectedCategories)} checked={categories.length > 0 && selectedCategories.length === categories.length} style={{ cursor: 'pointer' }} />
            <label htmlFor="selectAllCategories" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Tout sélectionner</label>
          </div>
        )}

        <div className="list-container">
          {categories.map(cat => (
            <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', backgroundColor: selectedCategories.includes(cat.id) ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              
              <input type="checkbox" checked={selectedCategories.includes(cat.id)} onChange={() => toggleSelection(cat.id, selectedCategories, setSelectedCategories)} style={{ cursor: 'pointer', marginRight: '5px' }} />

              {editingCategoryId === cat.id ? (
                <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                  <input type="text" className="input-control" value={editCategoryForm.nom} onChange={e => setEditCategoryForm({...editCategoryForm, nom: e.target.value})} />
                  <button onClick={() => saveEditCategory(cat.id)} className="btn btn-success btn-small"><CheckCircle size={14} /></button>
                  <button onClick={() => setEditingCategoryId(null)} className="btn btn-small" style={{background:'var(--bg-input)'}}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 'bold', color: cat.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>{cat.nom}</span>
                  {!cat.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                </div>
              )}

              {editingCategoryId !== cat.id && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditCategory(cat)} className="btn btn-small" style={{backgroundColor: 'var(--bg-input)', color: 'var(--text-main)'}} title="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => toggleStatus('depenses_categories', cat.id, cat.actif)} className={`btn btn-small ${cat.actif ? 'btn-danger' : 'btn-success'}`} title={cat.actif ? "Archiver" : "Activer"}>
                    {cat.actif ? <Archive size={14}/> : <CheckCircle size={14}/>}
                  </button>
                  <button onClick={() => handleDelete('depenses_categories', cat.id)} className="btn btn-small btn-danger" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION ÉQUIPE */}
      <div className="card">
        <h2 className="card-title">Membres de l'équipe</h2>
        
        <form onSubmit={handleAddEmploye} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          <input type="text" className="input-control" placeholder="Nom" value={newEmploye.nom} onChange={(e) => setNewEmploye({...newEmploye, nom: e.target.value})} />
          <input type="text" className="input-control" placeholder="Rôle (ex: Coiffeur)" value={newEmploye.role} onChange={(e) => setNewEmploye({...newEmploye, role: e.target.value})} />
          <select className="input-control" value={newEmploye.categorie} onChange={(e) => setNewEmploye({...newEmploye, categorie: e.target.value})}>
            <option value="Prestataire">Prestataire</option>
            <option value="Support / Gestion">Support / Gestion</option>
          </select>
          <input type="number" className="input-control" placeholder="Salaire (FCFA)" value={newEmploye.salaire} onChange={(e) => setNewEmploye({...newEmploye, salaire: e.target.value})} />
          <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}><Plus size={18} /> Ajouter un membre</button>
        </form>

        <BulkActionBar 
          selectedIds={selectedEmployes} 
          collectionName="employes" 
          onClearSelection={() => setSelectedEmployes([])} 
        />
        {employes.length > 0 && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="selectAllEmployes" onChange={e => toggleAll(e, employes, setSelectedEmployes)} checked={employes.length > 0 && selectedEmployes.length === employes.length} style={{ cursor: 'pointer' }} />
            <label htmlFor="selectAllEmployes" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Tout sélectionner</label>
          </div>
        )}

        <div className="list-container">
          {employes.map(emp => (
            <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', backgroundColor: selectedEmployes.includes(emp.id) ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              
              <input type="checkbox" checked={selectedEmployes.includes(emp.id)} onChange={() => toggleSelection(emp.id, selectedEmployes, setSelectedEmployes)} style={{ cursor: 'pointer', marginRight: '5px' }} />

              {editingEmployeId === emp.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, width: '100%', padding: '10px 0' }}>
                  <div className="form-group" style={{ margin: 0, width: '100%' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Nom complet</label>
                    <input type="text" className="input-control" style={{ width: '100%' }} value={editEmployeForm.nom} onChange={e => setEditEmployeForm({...editEmployeForm, nom: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ margin: 0, width: '100%' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Rôle (ex: Coiffeur)</label>
                    <input type="text" className="input-control" style={{ width: '100%' }} value={editEmployeForm.role} onChange={e => setEditEmployeForm({...editEmployeForm, role: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ margin: 0, width: '100%' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Catégorie</label>
                    <select className="input-control" style={{ width: '100%' }} value={editEmployeForm.categorie} onChange={e => setEditEmployeForm({...editEmployeForm, categorie: e.target.value})}>
                      <option value="Prestataire">Prestataire</option>
                      <option value="Support / Gestion">Support / Gestion</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0, width: '100%' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Salaire fixe (FCFA)</label>
                    <input type="number" className="input-control" style={{ width: '100%' }} value={editEmployeForm.salaire} onChange={e => setEditEmployeForm({...editEmployeForm, salaire: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button onClick={() => saveEditEmploye(emp.id)} className="btn btn-success" style={{ flex: 1 }}><CheckCircle size={18} /> Enregistrer</button>
                    <button onClick={() => setEditingEmployeId(null)} className="btn" style={{ background: 'var(--bg-input)', color: 'var(--text-main)', flex: 1 }}><X size={18} /> Annuler</button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', color: emp.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    {emp.nom} - <span style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{emp.role}</span>
                    <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--success)', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>{globalPoints[emp.id] || 0} pts</span>
                    {!emp.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: '600' }}>
                    Catégorie: {emp.categorie || 'Prestataire'} | Salaire: {emp.salaireFixe} FCFA
                  </div>
                </div>
              )}

              {editingEmployeId !== emp.id && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditEmploye(emp)} className="btn btn-small" style={{backgroundColor: 'var(--bg-input)', color: 'var(--text-main)'}} title="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => toggleStatus('employes', emp.id, emp.actif)} className={`btn btn-small ${emp.actif ? 'btn-danger' : 'btn-success'}`} title={emp.actif ? "Archiver" : "Activer"}>
                    {emp.actif ? <Archive size={14}/> : <CheckCircle size={14}/>}
                  </button>
                  <button onClick={() => handleDelete('employes', emp.id)} className="btn btn-small btn-danger" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION CHARGES FIXES */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Gestion des Charges Fixes</h2>
          <div style={{ fontWeight: 'bold', color: 'var(--danger)', fontSize: '1.1rem' }}>
            Total Mensuel : {chargesFixes.filter(c => c.actif).reduce((acc, c) => acc + Number(c.montant), 0).toLocaleString('fr-FR')} FCFA
          </div>
        </div>
        
        <form onSubmit={handleAddCharge} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="input-control" 
            placeholder="Nom (ex: Loyer, Nigelec)" 
            value={newCharge.nom} 
            onChange={(e) => setNewCharge({...newCharge, nom: e.target.value})}
            style={{ flex: 1, minWidth: '150px' }}
          />
          <input 
            type="number" 
            className="input-control" 
            placeholder="Montant mensuel (FCFA)" 
            value={newCharge.montant} 
            onChange={(e) => setNewCharge({...newCharge, montant: e.target.value})}
            style={{ width: '200px' }}
          />
          <button type="submit" className="btn btn-primary"><Plus size={18} /> Ajouter</button>
        </form>

        <BulkActionBar 
          selectedIds={selectedCharges} 
          collectionName="charges_fixes" 
          onClearSelection={() => setSelectedCharges([])} 
        />
        {chargesFixes.length > 0 && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="selectAllCharges" onChange={e => toggleAll(e, chargesFixes, setSelectedCharges)} checked={chargesFixes.length > 0 && selectedCharges.length === chargesFixes.length} style={{ cursor: 'pointer' }} />
            <label htmlFor="selectAllCharges" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Tout sélectionner</label>
          </div>
        )}

        <div className="list-container">
          {chargesFixes.map(charge => (
            <div key={charge.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', backgroundColor: selectedCharges.includes(charge.id) ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              
              <input type="checkbox" checked={selectedCharges.includes(charge.id)} onChange={() => toggleSelection(charge.id, selectedCharges, setSelectedCharges)} style={{ cursor: 'pointer', marginRight: '5px' }} />

              {editingChargeId === charge.id ? (
                <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                  <input type="text" className="input-control" value={editChargeForm.nom} onChange={e => setEditChargeForm({...editChargeForm, nom: e.target.value})} />
                  <input type="number" className="input-control" value={editChargeForm.montant} onChange={e => setEditChargeForm({...editChargeForm, montant: e.target.value})} style={{ width: '150px' }} />
                  <button onClick={() => saveEditCharge(charge.id)} className="btn btn-success btn-small"><CheckCircle size={14} /></button>
                  <button onClick={() => setEditingChargeId(null)} className="btn btn-small" style={{background:'var(--bg-input)'}}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 'bold', color: charge.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>{charge.nom}</span>
                  <span style={{ marginLeft: '10px', color: 'var(--danger)', fontWeight: 'bold' }}>{charge.montant.toLocaleString('fr-FR')} FCFA</span>
                  {!charge.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                </div>
              )}

              {editingChargeId !== charge.id && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEditCharge(charge)} className="btn btn-small" style={{backgroundColor: 'var(--bg-input)', color: 'var(--text-main)'}} title="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => toggleStatus('charges_fixes', charge.id, charge.actif)} className={`btn btn-small ${charge.actif ? 'btn-danger' : 'btn-success'}`} title={charge.actif ? "Archiver" : "Activer"}>
                    {charge.actif ? <Archive size={14}/> : <CheckCircle size={14}/>}
                  </button>
                  <button onClick={() => handleDelete('charges_fixes', charge.id)} className="btn btn-small btn-danger" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* ── GESTION DES UTILISATEURS ─────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <ShieldCheck size={20} color="var(--accent-color)" />
          <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Gestion des Accès & Utilisateurs</h2>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
          Créer un nouveau compte. Attribuez-lui le rôle Administrateur ou Agent (accès restreint). La session actuelle reste active.
        </p>

        {adminMsg && (
          <div style={{
            padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
            backgroundColor: adminMsg.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            color: adminMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${adminMsg.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            fontSize: '0.9rem'
          }}>
            {adminMsg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
            <label>Email du nouvel administrateur</label>
            <input
              type="email"
              className="input-control"
              placeholder="admin2@barbershop.com"
              value={adminEmail}
              onChange={e => { setAdminEmail(e.target.value); setAdminMsg(null); }}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
            <label>Mot de passe (min. 6 caractères)</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showAdminPassword ? "text" : "password"}
                className="input-control"
                placeholder="••••••••"
                value={adminPassword}
                onChange={e => { setAdminPassword(e.target.value); setAdminMsg(null); }}
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword(!showAdminPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0
                }}
                title={showAdminPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '150px', margin: 0 }}>
            <label>Rôle</label>
            <select
              className="input-control"
              value={adminRole}
              onChange={e => setAdminRole(e.target.value)}
            >
              <option value="admin">Administrateur</option>
              <option value="agent">Agent (Limité)</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0' }}>
            <button
              onClick={handleCreateAdmin}
              className="btn btn-primary"
              disabled={adminLoading}
              style={{ whiteSpace: 'nowrap' }}
            >
              {adminLoading
                ? 'Création...'
                : <><UserPlus size={16} /> Créer le compte</>
              }
            </button>
          </div>
        </div>

        <div className="list-container" style={{ marginTop: '20px' }}>
          {usersList.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 10px', borderBottom: '1px solid var(--border-color)', backgroundColor: !u.actif ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: u.actif ? 'var(--text-main)' : 'var(--text-muted)' }}>{u.email}</div>
                <div style={{ fontSize: '0.85rem', color: u.role === 'admin' ? 'var(--danger)' : 'var(--accent-color)', fontWeight: '600' }}>
                  {u.role === 'admin' ? 'Administrateur' : 'Agent (Limité)'}
                </div>
                {!u.actif && <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 'bold', marginTop: '4px' }}>Accès révoqué</div>}
                
                {u.role === 'agent' && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '600' }}>Permissions :</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {MODULES_AGENTS.map(mod => (
                        <label key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: (u.actif ? 'pointer' : 'not-allowed'), fontSize: '0.8rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: u[mod.key] ? 'rgba(37,99,235,0.08)' : 'transparent', color: u[mod.key] ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                          <input 
                            type="checkbox" 
                            checked={!!u[mod.key]}
                            onChange={(e) => updateDoc(doc(db, 'users', u.id), { [mod.key]: e.target.checked })}
                            disabled={!u.actif}
                            style={{ cursor: (u.actif ? 'pointer' : 'not-allowed') }}
                          />
                          {mod.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select 
                  className="input-control" 
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.85rem', height: 'auto', margin: 0 }}
                  value={u.role || 'agent'} 
                  onChange={(e) => updateDoc(doc(db, 'users', u.id), { role: e.target.value })}
                  disabled={!u.actif || u.email === auth.currentUser?.email}
                >
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                </select>
                {u.email !== auth.currentUser?.email && (
                  <button 
                    onClick={() => updateDoc(doc(db, 'users', u.id), { actif: u.actif === false ? true : false })} 
                    className={`btn btn-small ${u.actif !== false ? 'btn-danger' : 'btn-success'}`}
                  >
                    {u.actif !== false ? 'Révoquer' : 'Réactiver'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Parametres;
