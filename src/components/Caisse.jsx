import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { PlusCircle, MinusCircle, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';

const Caisse = () => {
  // State for reference data
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Form state
  const [typeTransaction, setTypeTransaction] = useState('prestation'); // 'prestation' or 'depense'
  const [montant, setMontant] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [motifDepense, setMotifDepense] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [modePaiement, setModePaiement] = useState('Cash');
  const [selectedEmployeId, setSelectedEmployeId] = useState('');

  // History Tab & Accordion State
  const [activeHistoryTab, setActiveHistoryTab] = useState('aujourd_hui'); // 'aujourd_hui', 'cette_semaine', 'ce_mois'
  const [expandedDays, setExpandedDays] = useState({});

  // Fetch reference data
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => s.actif));
    });
    
    const unsubCategories = onSnapshot(collection(db, 'depenses_categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.actif));
    });

    const unsubEmployes = onSnapshot(collection(db, 'employes'), (snapshot) => {
      setEmployes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(e => e.actif));
    });

    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubTransactions = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubServices();
      unsubCategories();
      unsubEmployes();
      unsubTransactions();
    };
  }, []);

  // Auto-fill price when a service is selected
  useEffect(() => {
    if (typeTransaction === 'prestation' && selectedServiceId) {
      const service = services.find(s => s.id === selectedServiceId);
      if (service) {
        setMontant(service.prixDefaut.toString());
      }
    }
  }, [selectedServiceId, services, typeTransaction]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!montant || isNaN(Number(montant)) || !selectedEmployeId) {
      alert("Veuillez remplir le montant et assigner un membre de l'équipe.");
      return;
    }

    const employe = employes.find(e => e.id === selectedEmployeId);
    let motif = '';
    let categoryName = '';

    if (typeTransaction === 'prestation') {
      if (!selectedServiceId) {
        alert("Veuillez sélectionner un service.");
        return;
      }
      const service = services.find(s => s.id === selectedServiceId);
      motif = service ? service.nom : 'Service inconnu';
    } else {
      if (!motifDepense || !selectedCategoryId) {
        alert("Veuillez remplir le motif et la catégorie de la dépense.");
        return;
      }
      motif = motifDepense;
      const cat = categories.find(c => c.id === selectedCategoryId);
      categoryName = cat ? cat.nom : 'Inconnue';
    }

    const newTransaction = {
      type: typeTransaction,
      montant: Number(montant),
      motif,
      categorie: categoryName,
      employeId: selectedEmployeId,
      employeNom: employe ? employe.nom : 'Inconnu',
      modePaiement,
      date: new Date().toISOString()
    };

    await addDoc(collection(db, 'transactions'), newTransaction);

    // Reset fields
    setMontant('');
    setSelectedServiceId('');
    setMotifDepense('');
    setSelectedCategoryId('');
  };

  const handleDelete = async (id) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette opération ?")) {
      await deleteDoc(doc(db, 'transactions', id));
    }
  };

  const toggleDayAccordion = (dayStr) => {
    setExpandedDays(prev => ({ ...prev, [dayStr]: !prev[dayStr] }));
  };

  // Filter transactions
  const getFilteredTransactions = () => {
    const now = new Date();
    
    // Start of Today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Start of Week (Monday)
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - currentDay + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of Month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return transactions.filter(t => {
      const d = new Date(t.date);
      if (activeHistoryTab === 'aujourd_hui') {
        return d >= startOfToday;
      } else if (activeHistoryTab === 'cette_semaine') {
        return d >= startOfWeek;
      } else { // 'ce_mois'
        return d >= startOfMonth;
      }
    });
  };

  const filteredTransactions = getFilteredTransactions();

  // Group by day for "Cette Semaine" and "Ce Mois"
  const groupedTransactions = {};
  filteredTransactions.forEach(t => {
    const d = new Date(t.date);
    const dayStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const capitalizedDayStr = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
    
    if (!groupedTransactions[capitalizedDayStr]) {
      groupedTransactions[capitalizedDayStr] = {
        dateRef: d,
        transactions: [],
        total: 0,
        count: 0
      };
    }
    groupedTransactions[capitalizedDayStr].transactions.push(t);
    groupedTransactions[capitalizedDayStr].count += 1;
    if (t.type === 'prestation') {
      groupedTransactions[capitalizedDayStr].total += Number(t.montant);
    } else {
      groupedTransactions[capitalizedDayStr].total -= Number(t.montant);
    }
  });

  const sortedDays = Object.keys(groupedTransactions).sort((a, b) => {
    return groupedTransactions[b].dateRef - groupedTransactions[a].dateRef;
  });

  // Calculate totals
  const totalVentes = filteredTransactions
    .filter(t => t.type === 'prestation')
    .reduce((acc, curr) => acc + Number(curr.montant), 0);

  const totalDepenses = filteredTransactions
    .filter(t => t.type === 'depense')
    .reduce((acc, curr) => acc + Number(curr.montant), 0);

  const resteEnCaisse = totalVentes - totalDepenses;

  // Format time
  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // Reusable component for Transaction Table
  const TransactionTable = ({ txList }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '10px' }}>Heure</th>
            <th style={{ padding: '10px' }}>Type</th>
            <th style={{ padding: '10px' }}>Motif</th>
            <th style={{ padding: '10px' }}>Employé</th>
            <th style={{ padding: '10px' }}>Mode</th>
            <th style={{ padding: '10px', textAlign: 'right' }}>Montant</th>
            <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {txList.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Aucune opération.
              </td>
            </tr>
          ) : (
            txList.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px', fontSize: '0.9rem' }}>{formatTime(t.date)}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '12px', 
                    fontSize: '0.8rem', 
                    backgroundColor: t.type === 'prestation' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: t.type === 'prestation' ? 'var(--success)' : 'var(--danger)',
                    fontWeight: '600'
                  }}>
                    {t.type === 'prestation' ? 'Vente' : 'Dépense'}
                  </span>
                </td>
                <td style={{ padding: '10px', fontWeight: '500' }}>
                  {t.motif}
                  {t.type === 'depense' && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.categorie}</span>}
                </td>
                <td style={{ padding: '10px' }}>{t.employeNom}</td>
                <td style={{ padding: '10px' }}>{t.modePaiement}</td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: t.type === 'prestation' ? 'var(--success)' : 'var(--text-main)' }}>
                  {t.type === 'depense' ? '-' : ''}{t.montant} FCFA
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <button 
                    onClick={() => handleDelete(t.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                    title="Supprimer"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="view-container">
      {/* FORMULAIRE DE SAISIE */}
      <div className="card">
        <h2 className="card-title">Nouvelle Opération</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            type="button"
            className={`btn ${typeTransaction === 'prestation' ? 'btn-success' : ''}`}
            onClick={() => setTypeTransaction('prestation')}
            style={{ flex: 1, backgroundColor: typeTransaction === 'prestation' ? 'var(--success)' : 'var(--bg-input)', color: typeTransaction === 'prestation' ? '#fff' : 'var(--text-main)' }}
          >
            <PlusCircle size={18} /> Prestation / Vente
          </button>
          <button 
            type="button"
            className={`btn ${typeTransaction === 'depense' ? 'btn-danger' : ''}`}
            onClick={() => setTypeTransaction('depense')}
            style={{ flex: 1, backgroundColor: typeTransaction === 'depense' ? 'var(--danger)' : 'var(--bg-input)', color: typeTransaction === 'depense' ? '#fff' : 'var(--text-main)' }}
          >
            <MinusCircle size={18} /> Dépense / Charge
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            
            {typeTransaction === 'prestation' ? (
              <div className="form-group">
                <label>Service</label>
                <select 
                  className="input-control"
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                >
                  <option value="">Sélectionner un service</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Motif de la dépense</label>
                  <input 
                    type="text" 
                    className="input-control" 
                    placeholder="Ex: Achat produits, Facture..."
                    value={motifDepense}
                    onChange={(e) => setMotifDepense(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Catégorie</label>
                  <select 
                    className="input-control"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label>Montant (FCFA)</label>
              <input 
                type="number" 
                className="input-control" 
                placeholder="Ex: 5000"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Mode de paiement</label>
              <select 
                className="input-control"
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="Nita">Nita</option>
                <option value="Transfert">Transfert</option>
              </select>
            </div>

            <div className="form-group">
              <label>Membre de l'équipe</label>
              <select 
                className="input-control"
                value={selectedEmployeId}
                onChange={(e) => setSelectedEmployeId(e.target.value)}
              >
                <option value="">Assigner à...</option>
                {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
            <Save size={18} /> Enregistrer
          </button>
        </form>
      </div>

      {/* JOURNAL D'HISTORIQUE AVEC ONGLETS */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 className="card-title" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>Journal des opérations</h2>
          <div style={{ display: 'flex', gap: '5px', backgroundColor: 'var(--bg-input)', padding: '5px', borderRadius: '12px' }}>
            <button 
              className={`nav-btn ${activeHistoryTab === 'aujourd_hui' ? 'active' : ''}`}
              onClick={() => setActiveHistoryTab('aujourd_hui')}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Aujourd'hui</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'cette_semaine' ? 'active' : ''}`}
              onClick={() => setActiveHistoryTab('cette_semaine')}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Cette Semaine</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'ce_mois' ? 'active' : ''}`}
              onClick={() => setActiveHistoryTab('ce_mois')}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Ce Mois</button>
          </div>
        </div>

        {activeHistoryTab === 'aujourd_hui' ? (
          <TransactionTable txList={filteredTransactions} />
        ) : (
          <div>
            {sortedDays.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Aucune opération trouvée.</p>
            ) : (
              sortedDays.map(dayStr => {
                const dayData = groupedTransactions[dayStr];
                const isExpanded = expandedDays[dayStr];
                return (
                  <div key={dayStr} className="accordion-item">
                    <div className="accordion-header" onClick={() => toggleDayAccordion(dayStr)}>
                      <div>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{dayStr}</span>
                        <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{dayData.count} Opérations</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontWeight: 'bold', color: dayData.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          Bilan : {dayData.total} FCFA
                        </span>
                        {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="accordion-content">
                        <TransactionTable txList={dayData.transactions} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* BARRE DE TOTAUX (DYNAMIQUE SELON L'ONGLET) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Ventes</h3>
          <p style={{ fontSize: '1.5rem', color: 'var(--success)', fontWeight: 'bold' }}>{totalVentes} FCFA</p>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Dépenses</h3>
          <p style={{ fontSize: '1.5rem', color: 'var(--danger)', fontWeight: 'bold' }}>{totalDepenses} FCFA</p>
        </div>
        <div className="card" style={{ marginBottom: 0, backgroundColor: resteEnCaisse >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '5px' }}>RESTE EN CAISSE</h3>
          <p style={{ fontSize: '1.75rem', color: resteEnCaisse >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
            {resteEnCaisse} FCFA
          </p>
        </div>
      </div>
    </div>
  );
};

export default Caisse;
