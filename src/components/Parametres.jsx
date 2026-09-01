import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { Archive, CheckCircle, Plus, Edit2, Trash2, Save, X, UserPlus, ShieldCheck } from 'lucide-react';
import { logEvent } from '../utils/audit';
import BulkActionBar from './BulkActionBar';

const Parametres = () => {
  // Collection States
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);
  
  // Daily & Monthly Goal State
  const [dailyGoal,    setDailyGoal]    = useState('');
  const [monthlyGoal,  setMonthlyGoal]  = useState('');
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [isGoalSaving, setIsGoalSaving] = useState(false);

  // Admin creation state
  const [adminEmail,    setAdminEmail]    = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminRole,     setAdminRole]     = useState('agent');
  const [adminLoading,  setAdminLoading]  = useState(false);
  const [adminMsg,      setAdminMsg]      = useState(null); // { type: 'success'|'error', text }

  // Users state
  const [usersList, setUsersList] = useState([]);

  // Forms States (Add)
  const [newService, setNewService] = useState({ nom: '', prix: '' });
  const [newCategory, setNewCategory] = useState({ nom: '' });
  const [newEmploye, setNewEmploye] = useState({ nom: '', role: '', commission: '', salaire: '' });
  const [newCharge, setNewCharge] = useState({ nom: '', montant: '' });

  // Edit States
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editServiceForm, setEditServiceForm] = useState({ nom: '', prix: '' });

  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editCategoryForm, setEditCategoryForm] = useState({ nom: '' });

  const [editingEmployeId, setEditingEmployeId] = useState(null);
  const [editEmployeForm, setEditEmployeForm] = useState({ nom: '', role: '', commission: '', salaire: '' });

  const [editingChargeId, setEditingChargeId] = useState(null);
  const [editChargeForm, setEditChargeForm] = useState({ nom: '', montant: '' });

  // Bulk Selection States
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedEmployes, setSelectedEmployes] = useState([]);
  const [selectedCharges, setSelectedCharges] = useState([]);

  // Load Data
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
    
    // We fetch all transactions to filter by month (can be optimized if needed)
    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      let rev = 0;
      snapshot.docs.forEach(d => {
        const t = d.data();
        if (t.type === 'prestation' && t.date >= startOfMonth && t.date <= endOfMonth) {
          rev += Number(t.montant);
        }
      });
      setMonthRevenue(rev);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubServices();
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
      nom: newEmploye.nom, role: newEmploye.role, 
      commission: Number(newEmploye.commission) || 0, salaireFixe: Number(newEmploye.salaire) || 0, actif: true
    });
    setNewEmploye({ nom: '', role: '', commission: '', salaire: '' });
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
      const secondaryApp  = initializeApp(auth.app.options, 'SecondaryAdminApp_' + Date.now());
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
      commission: emp.commission !== undefined ? emp.commission.toString() : '', 
      salaire: emp.salaireFixe !== undefined ? emp.salaireFixe.toString() : '' 
    });
  };
  const saveEditEmploye = async (id) => {
    try {
      await updateDoc(doc(db, 'employes', id), { 
        nom: editEmployeForm.nom, 
        role: editEmployeForm.role, 
        commission: Number(editEmployeForm.commission) || 0, 
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
    await updateDoc(doc(db, 'charges_fixes', id), { 
      nom: editChargeForm.nom, 
      montant: Number(editChargeForm.montant) 
    });
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
          <input type="number" className="input-control" placeholder="Commission (%)" value={newEmploye.commission} onChange={(e) => setNewEmploye({...newEmploye, commission: e.target.value})} />
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
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Commission (%)</label>
                    <input type="number" className="input-control" style={{ width: '100%' }} value={editEmployeForm.commission} onChange={e => setEditEmployeForm({...editEmployeForm, commission: e.target.value})} />
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
                    {!emp.actif && <span style={{ marginLeft: '10px', fontSize:'0.75rem', color:'var(--text-muted)'}}>(Archivé)</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: '600' }}>
                    Comm: {emp.commission}% | Salaire: {emp.salaireFixe} FCFA
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
            <input
              type="password"
              className="input-control"
              placeholder="••••••••"
              value={adminPassword}
              onChange={e => { setAdminPassword(e.target.value); setAdminMsg(null); }}
            />
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
