import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { PlusCircle, MinusCircle, Trash2, Save, ChevronDown, ChevronUp, FileText, ShieldAlert, CheckCircle } from 'lucide-react';
import { logEvent } from '../utils/audit';
import FactureModal from './FactureModal';
import BulkActionBar from './BulkActionBar';
import PanierPrestations from './PanierPrestations';

const Caisse = () => {
  // State for reference data
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);

  // Form state
  const [typeTransaction, setTypeTransaction] = useState('prestation');
  const [modePaiement, setModePaiement] = useState('Cash');
  const [selectedEmployeId, setSelectedEmployeId] = useState('');
  // Depense fields
  const [montant, setMontant] = useState('');
  const [motifDepense, setMotifDepense] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  // Discount state (for depense simulator only)
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountType, setDiscountType] = useState('pourcentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountMotif, setDiscountMotif] = useState('');
  // Multi-service panier state
  const [lignesPanier, setLignesPanier] = useState([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
  const [clientNomCaisse, setClientNomCaisse] = useState('');

  const [activeHistoryTab, setActiveHistoryTab] = useState('aujourd_hui'); // 'aujourd_hui', 'cette_semaine', 'ce_mois'
  const [expandedDays, setExpandedDays] = useState({});
  const [factureModal, setFactureModal] = useState(null);
  const [selectedTransactions, setSelectedTransactions] = useState([]);

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

    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), (snapshot) => {
      setChargesFixes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.actif));
    });

    return () => {
      unsubServices();
      unsubCategories();
      unsubEmployes();
      unsubTransactions();
      unsubCharges();
    };
  }, []);

  // Reset panier when switching to depense
  useEffect(() => {
    if (typeTransaction === 'depense') {
      setLignesPanier([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
    }
  }, [typeTransaction]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (typeTransaction === 'prestation') {
      // Validate panier
      for (const ligne of lignesPanier) {
        if (!ligne.serviceId) { alert('Veuillez sélectionner un service pour chaque prestation.'); return; }
        if (!ligne.agents || ligne.agents.length === 0) { alert(`Veuillez assigner au moins un agent à la prestation : ${ligne.serviceNom || 'sans nom'}.`); return; }
        if (ligne.remiseType !== 'aucune' && !ligne.remiseMotif.trim()) { alert(`Un motif de remise est obligatoire pour : ${ligne.serviceNom}.`); return; }
      }

      const totalMontant = lignesPanier.reduce((acc, l) => acc + Number(l.prixFinal || 0), 0);
      const allAgentNoms = [...new Set(lignesPanier.flatMap(l => l.agents.map(a => a.nom)))];

      const newTransaction = {
        type: 'prestation',
        montant: totalMontant,
        motif: lignesPanier.length === 1 ? lignesPanier[0].serviceNom : `Forfait (${lignesPanier.length} prestations)`,
        clientNom: clientNomCaisse.trim() || 'Client anonyme',
        employeNom: allAgentNoms.join(', '),
        employeId: lignesPanier[0].agents[0]?.id || '',
        modePaiement,
        date: new Date().toISOString(),
        lignes: lignesPanier.map(l => ({
          serviceId: l.serviceId,
          serviceNom: l.serviceNom,
          prixBase: Number(l.prixBase) || 0,
          prixFinal: Number(l.prixFinal) || 0,
          remiseType: l.remiseType,
          remiseValeur: l.remiseValeur,
          remiseMotif: l.remiseMotif,
          agents: l.agents,
        }))
      };

      await addDoc(collection(db, 'transactions'), newTransaction);
      await logEvent('TRANSACTION_CREATE', `Vente multi-services (${lignesPanier.length} prestations) de ${totalMontant} FCFA. Agents: ${allAgentNoms.join(', ')}. Mode: ${modePaiement}`);

      // Reset
      setLignesPanier([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
      setClientNomCaisse('');

    } else {
      // Dépense
      if (!montant || isNaN(Number(montant))) { alert('Veuillez saisir un montant valide.'); return; }
      if (!motifDepense || !selectedCategoryId) { alert('Veuillez remplir le motif et la catégorie de la dépense.'); return; }
      if (!selectedEmployeId) { alert("Veuillez assigner un membre de l'équipe."); return; }

      const employe = employes.find(e => e.id === selectedEmployeId);
      const cat = categories.find(c => c.id === selectedCategoryId);

      const newTransaction = {
        type: 'depense',
        montant: Number(montant),
        motif: motifDepense,
        categorie: cat ? cat.nom : 'Inconnue',
        employeId: selectedEmployeId,
        employeNom: employe ? employe.nom : 'Inconnu',
        modePaiement,
        date: new Date().toISOString()
      };

      await addDoc(collection(db, 'transactions'), newTransaction);
      await logEvent('TRANSACTION_CREATE', `Dépense de ${montant} FCFA. Motif: ${motifDepense}. Mode: ${modePaiement}`);

      setMontant('');
      setMotifDepense('');
      setSelectedCategoryId('');
    }
  };

  const handleDelete = async (id, typeTransaction, montant, motif) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette opération ?")) {
      await deleteDoc(doc(db, 'transactions', id));
      await logEvent('TRANSACTION_DELETE', `Suppression transaction (${typeTransaction}) de ${montant} FCFA. Motif: ${motif}`);
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

  // Safe Spend Simulator variables
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthTx = transactions.filter(t => new Date(t.date) >= startOfMonth);
  
  const totalMonthCA = currentMonthTx.filter(t => t.type === 'prestation').reduce((acc, t) => acc + Number(t.montant), 0);
  const totalSalaries = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const totalChargesFixesVal = chargesFixes.reduce((acc, c) => acc + (Number(c.montant) || 0), 0);
  const tresorerieNette = totalMonthCA - totalSalaries - totalChargesFixesVal;

  let simStatus = null;
  if (typeTransaction === 'depense' && montant) {
    const askAmount = Number(montant) || 0;
    if (tresorerieNette >= askAmount) {
      simStatus = {
        color: 'var(--success)', icon: <CheckCircle size={18} />,
        text: `VERT : Le fonds de roulement actuel permet ce ravitaillement. Trésorerie nette restante : ${tresorerieNette - askAmount} F.`
      };
    } else {
      simStatus = {
        color: 'var(--danger)', icon: <ShieldAlert size={18} />,
        text: `ROUGE (Alerte Trésorerie) : Dépense risquée. Cette dépense entraînera un découvert sur le budget des charges fixes du mois.`
      };
    }
  }

  // Calculate dynamic price for UI display if discount is active
  let displayPrice = Number(montant) || 0;
  if (typeTransaction === 'prestation' && hasDiscount) {
    if (discountType === 'offert') displayPrice = 0;
    else if (discountType === 'pourcentage') displayPrice = Math.max(0, displayPrice - (displayPrice * (Number(discountValue) || 0) / 100));
    else if (discountType === 'fixe') displayPrice = Math.max(0, displayPrice - (Number(discountValue) || 0));
  }

  // Bulk Selection Helpers
  const toggleSelection = (id) => {
    setSelectedTransactions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleAll = (e, txList) => {
    if (e.target.checked) setSelectedTransactions(txList.map(t => t.id));
    else setSelectedTransactions([]);
  };

  // Reusable component for Transaction Table
  const TransactionTable = ({ txList }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '10px', width: '40px' }}>
              <input 
                type="checkbox" 
                onChange={(e) => toggleAll(e, txList)}
                checked={txList.length > 0 && txList.every(t => selectedTransactions.includes(t.id))}
                style={{ cursor: 'pointer' }}
              />
            </th>
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
              <tr key={t.id} style={{ 
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: selectedTransactions.includes(t.id) ? 'rgba(37,99,235,0.05)' : 'transparent'
              }}>
                <td style={{ padding: '10px' }}>
                  <input 
                    type="checkbox"
                    checked={selectedTransactions.includes(t.id)}
                    onChange={() => toggleSelection(t.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
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
                  {t.clientNom && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Client : {t.clientNom}</span>}
                  {t.type === 'depense' && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.categorie}</span>}
                  {t.lignes && t.lignes.length > 1 && (
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {t.lignes.map((l, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                          {l.serviceNom} — {l.agents.map(a => a.nom).join(', ')} — {Number(l.prixFinal).toLocaleString('fr-FR')} FCFA
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px' }}>{t.employeNom}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem',
                    backgroundColor: 'var(--bg-input)', fontWeight: '600', color: 'var(--text-main)'
                  }}>
                    {t.modePaiement}
                  </span>
                </td>
                <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: t.type === 'prestation' ? 'var(--success)' : 'var(--text-main)' }}>
                  {t.type === 'depense' ? '-' : ''}{t.montant} FCFA
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {t.type === 'prestation' && (
                      <button 
                        onClick={() => setFactureModal(t)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}
                        title="Reçu"
                      >
                        <FileText size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(t.id, t.type, t.montant, t.motif)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                      title="Supprimer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
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
          {typeTransaction === 'prestation' ? (
            <PanierPrestations
              lignes={lignesPanier}
              setLignes={setLignesPanier}
              services={services}
              employes={employes}
              clientNom={clientNomCaisse}
              setClientNom={setClientNomCaisse}
              modePaiement={modePaiement}
              setModePaiement={setModePaiement}
              showClientField={true}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div className="form-group">
                <label>Motif de la dépense</label>
                <input type="text" className="input-control" placeholder="Ex: Achat produits, Facture..."
                  value={motifDepense} onChange={(e) => setMotifDepense(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Catégorie</label>
                <select className="input-control" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                  <option value="">Sélectionner une catégorie</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Montant (FCFA)</label>
                <input type="number" className="input-control" placeholder="Ex: 5000"
                  value={montant} onChange={(e) => setMontant(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Mode de paiement</label>
                <select className="input-control" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="NITA">NITA</option>
                  <option value="AMANA">AMANA</option>
                  <option value="Carte VISA">Carte VISA</option>
                </select>
              </div>
              <div className="form-group">
                <label>Membre de l'équipe</label>
                <select className="input-control" value={selectedEmployeId} onChange={(e) => setSelectedEmployeId(e.target.value)}>
                  <option value="">Assigner à...</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            </div>
          )}

          {typeTransaction === 'depense' && simStatus && (
            <div style={{
              padding: '12px', borderRadius: '8px', marginTop: '15px', fontSize: '0.9rem',
              backgroundColor: 'var(--bg-input)', color: simStatus.color, display: 'flex', alignItems: 'center', gap: '10px',
              border: `1px solid ${simStatus.color}`
            }}>
              <div>{simStatus.icon}</div>
              <div style={{ fontWeight: '600', lineHeight: '1.4' }}>{simStatus.text}</div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }}>
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
              onClick={() => { setActiveHistoryTab('aujourd_hui'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Aujourd'hui</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'cette_semaine' ? 'active' : ''}`}
              onClick={() => { setActiveHistoryTab('cette_semaine'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Cette Semaine</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'ce_mois' ? 'active' : ''}`}
              onClick={() => { setActiveHistoryTab('ce_mois'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Ce Mois</button>
          </div>
        </div>

        <BulkActionBar 
          selectedIds={selectedTransactions} 
          collectionName="transactions" 
          onClearSelection={() => setSelectedTransactions([])} 
        />

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

      {factureModal && (
        <FactureModal 
          data={factureModal} 
          type="transaction" 
          onClose={() => setFactureModal(null)} 
        />
      )}
    </div>
  );
};

export default Caisse;
