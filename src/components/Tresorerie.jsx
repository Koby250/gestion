import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Wallet, ArrowRightLeft, Edit2, CheckCircle, Search, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { logEvent } from '../utils/audit';
import SuccessModal from './SuccessModal';

const accountsList = [
  { id: 'cash', label: 'Cash (Espèces)' },
  { id: 'nita', label: 'Nita' },
  { id: 'amana', label: 'Amana' },
  { id: 'visa', label: 'Carte VISA / Banque' },
  { id: 'autre', label: 'Autre' }
];

const Tresorerie = ({ activeDate = new Date().toISOString().substring(0, 10), currentUserNom = '' }) => {
  const [soldes, setSoldes] = useState({ cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 });
  
  // Editing state
  const [editingAccount, setEditingAccount] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Transfer state
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMsg, setTransferMsg] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // View state for mobile tabs
  const [activeTab, setActiveTab] = useState('balances'); // 'balances', 'transfer', 'history', 'journalier'
  const [transferHistory, setTransferHistory] = useState([]);
  
  // Data for journalier
  const [allTransactions, setAllTransactions] = useState([]);
  const [allAvances, setAllAvances] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);

  // Filters for history
  const [searchTresTerm, setSearchTresTerm] = useState('');
  const [dateDebutTres, setDateDebutTres] = useState('');
  const [dateFinTres, setDateFinTres] = useState('');

  useEffect(() => {

    const getModeKey = (m) => {
      if (!m) return 'cash';
      const lower = m.toLowerCase();
      if (lower.includes('visa')) return 'visa';
      if (lower.includes('nita')) return 'nita';
      if (lower.includes('amana')) return 'amana';
      if (lower.includes('cash')) return 'cash';
      return 'autre';
    };

    let txData = [];
    let avancesData = [];

    const calcTheo = () => {
      const theo = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
      txData.forEach(t => {
        const amount = Number(t.montant) || 0;
        if (t.type === 'prestation') {
          theo[getModeKey(t.modePaiement)] += amount;
        } else if (t.type === 'depense') {
          theo[getModeKey(t.modePaiement)] -= amount;
        } else if (t.type === 'transfert') {
          if (theo[t.fromAccount] !== undefined) theo[t.fromAccount] -= amount;
          if (theo[t.toAccount] !== undefined) theo[t.toAccount] += amount;
        } else if (t.type === 'ajustement') {
          theo[getModeKey(t.modePaiement)] += amount;
        }
      });
      avancesData.forEach(a => {
        const amount = Number(a.montant) || 0;
        theo[getModeKey(a.modePaiement)] -= amount;
      });
      setSoldes(theo);
    };

    const unsubTx = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      txData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      calcTheo();
      // Extract transfers
      setTransferHistory(txData.filter(t => t.type === 'transfert').sort((a, b) => new Date(b.date) - new Date(a.date)));
      setAllTransactions(txData);
    });

    const unsubAv = onSnapshot(collection(db, 'avances_salaires'), (snapshot) => {
      avancesData = snapshot.docs.map(d => d.data());
      calcTheo();
      setAllAvances(avancesData);
    });

    return () => {
      unsubTx();
      unsubAv();
    };
  }, []);

  const getTransactionDate = () => {
    const todayStr = new Date().toISOString().substring(0, 10);
    if (activeDate === todayStr) {
      return new Date().toISOString();
    } else {
      const now = new Date();
      const retroDate = new Date(activeDate);
      retroDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      return retroDate.toISOString();
    }
  };

  const totalReel = Object.values(soldes).reduce((a, b) => a + Number(b), 0);

  const handleUpdateSolde = async (accountId) => {
    const newVal = Number(editValue);
    if (isNaN(newVal)) return;
    
    const oldVal = Number(soldes[accountId] || 0);
    const diff = newVal - oldVal;
    
    if (diff !== 0) {
      await addDoc(collection(db, 'transactions'), {
        type: 'ajustement',
        montant: diff,
        modePaiement: accountId,
        motif: 'Ajustement de caisse / Erreur',
        date: getTransactionDate()
      });
      
      const accountName = accountsList.find(a => a.id === accountId)?.label || accountId;
      await logEvent('TRESORERIE_UPDATE', `Ajustement du compte ${accountName}. Différence: ${diff > 0 ? '+' : ''}${diff} F`);
    }
    
    setEditingAccount(null);
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferMsg(null);
    if (!transferFrom || !transferTo || transferFrom === transferTo) {
      setTransferMsg({ type: 'error', text: 'Veuillez sélectionner deux comptes différents.' });
      return;
    }
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) {
      setTransferMsg({ type: 'error', text: 'Montant invalide.' });
      return;
    }
    
    if (Number(soldes[transferFrom]) < amount) {
      setTransferMsg({ type: 'error', text: 'Solde insuffisant sur le compte source.' });
      return;
    }

    try {
      const accFrom = accountsList.find(a => a.id === transferFrom)?.label || transferFrom;
      const accTo = accountsList.find(a => a.id === transferTo)?.label || transferTo;

      await addDoc(collection(db, 'transactions'), {
        type: 'transfert',
        montant: amount,
        motif: `Transfert de ${accFrom} vers ${accTo}`,
        fromAccount: transferFrom,
        toAccount: transferTo,
        date: getTransactionDate(),
        saisieParNom: currentUserNom
      });

      await logEvent('TRESORERIE_TRANSFERT', `Transfert de ${amount} FCFA de [${accFrom}] vers [${accTo}]`);
      setTransferAmount('');
      setTransferFrom('');
      setTransferTo('');
      setShowSuccess(true);
      setTransferMsg(null);
    } catch {
      setTransferMsg({ type: 'error', text: 'Erreur lors du transfert.' });
    }
  };

  return (
    <div className="view-container">
      {showSuccess && <SuccessModal message="Transfert effectué avec succès !" onClose={() => setShowSuccess(false)} />}
      
      {/* Mobile-friendly Tabs / Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('balances')}
          className={`btn ${activeTab === 'balances' ? 'btn-primary' : ''}`}
          style={{ 
            flex: 1, minWidth: '120px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'balances' ? 'var(--accent-color)' : 'var(--bg-input)',
            color: activeTab === 'balances' ? '#fff' : 'var(--text-main)',
            border: 'none', fontWeight: 'bold'
          }}
        >
          <Wallet size={18} style={{ marginRight: '8px' }} /> Soldes
        </button>
        <button 
          onClick={() => setActiveTab('transfer')}
          className={`btn ${activeTab === 'transfer' ? 'btn-primary' : ''}`}
          style={{ 
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'transfer' ? 'var(--accent-color)' : 'var(--bg-input)',
            color: activeTab === 'transfer' ? '#fff' : 'var(--text-main)',
            border: 'none', fontWeight: 'bold'
          }}
        >
          <ArrowRightLeft size={18} style={{ marginRight: '8px' }} /> Effectuer transfert
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`btn ${activeTab === 'history' ? 'btn-primary' : ''}`}
          style={{ 
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'history' ? 'var(--accent-color)' : 'var(--bg-input)',
            color: activeTab === 'history' ? '#fff' : 'var(--text-main)',
            border: 'none', fontWeight: 'bold'
          }}
        >
          <CheckCircle size={18} style={{ marginRight: '8px' }} /> Historique
        </button>
        <button 
          onClick={() => setActiveTab('journalier')}
          className={`btn ${activeTab === 'journalier' ? 'btn-primary' : ''}`}
          style={{ 
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'journalier' ? 'var(--accent-color)' : 'var(--bg-input)',
            color: activeTab === 'journalier' ? '#fff' : 'var(--text-main)',
            border: 'none', fontWeight: 'bold'
          }}
        >
          <Calendar size={18} style={{ marginRight: '8px' }} /> Journalier
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* VUE D'ENSEMBLE */}
        {activeTab === 'balances' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Wallet size={24} color="var(--accent-color)" />
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Soldes des Comptes</h2>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              La trésorerie ci-dessous est calculée automatiquement à partir de toutes les transactions enregistrées.
            </p>

            <div style={{ backgroundColor: 'var(--bg-input)', padding: '20px', borderRadius: '12px', marginBottom: '25px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Solde Total Actuel</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalReel.toLocaleString('fr-FR')} FCFA</div>
              </div>
            </div>

            <div className="list-container">
              {accountsList.map(acc => {
                const sReal = Number(soldes[acc.id]) || 0;
                return (
                  <div key={acc.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                    padding: '15px', borderBottom: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{acc.label}</div>
                    
                    {editingAccount === acc.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input 
                          type="number" 
                          className="input-control" 
                          style={{ width: '120px', padding: '10px', minHeight: '44px' }}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                        />
                        <button onClick={() => handleUpdateSolde(acc.id)} className="btn btn-success" style={{ minHeight: '44px' }} title="Valider">
                          <CheckCircle size={18} />
                        </button>
                        <button onClick={() => setEditingAccount(null)} className="btn" style={{ minHeight: '44px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {sReal.toLocaleString('fr-FR')} FCFA
                        </span>
                        <button 
                          onClick={() => { setEditingAccount(acc.id); setEditValue(sReal); }}
                          className="btn"
                          style={{ backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', minHeight: '40px', padding: '0 12px' }}
                        >
                          <Edit2 size={16} /> Ajuster
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TRANSFERT */}
        {activeTab === 'transfer' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <ArrowRightLeft size={20} color="var(--accent-color)" />
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Transfert interne</h2>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Déplacer des fonds d'un compte à un autre (ex: dépôt Cash vers Nita).
            </p>

            {transferMsg && (
              <div style={{
                padding: '15px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem',
                backgroundColor: transferMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: transferMsg.type === 'success' ? 'var(--success)' : 'var(--danger)'
              }}>
                {transferMsg.text}
              </div>
            )}

            <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Compte Source (Débiter)</label>
                <select className="input-control" style={{ minHeight: '48px', fontSize: '1rem' }} value={transferFrom} onChange={e => setTransferFrom(e.target.value)} required>
                  <option value="">-- Sélectionner --</option>
                  {accountsList.map(a => (
                    <option key={a.id} value={a.id}>{a.label} ({Number(soldes[a.id]||0).toLocaleString('fr-FR')} F)</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Compte Destination (Créditer)</label>
                <select className="input-control" style={{ minHeight: '48px', fontSize: '1rem' }} value={transferTo} onChange={e => setTransferTo(e.target.value)} required>
                  <option value="">-- Sélectionner --</option>
                  {accountsList.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Montant (FCFA)</label>
                <input 
                  type="number" 
                  className="input-control" 
                  style={{ minHeight: '48px', fontSize: '1.1rem', fontWeight: 'bold' }}
                  value={transferAmount} 
                  onChange={e => setTransferAmount(e.target.value)} 
                  required 
                  placeholder="ex: 20000"
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ minHeight: '54px', fontSize: '1.1rem', borderRadius: '12px', marginTop: '10px' }}>
                <ArrowRightLeft size={20} style={{ marginRight: '8px' }} /> Transférer les fonds
              </button>
            </form>
          </div>
        )}

        {/* HISTORIQUE DES TRANSFERTS */}
        {activeTab === 'history' && (
          <div className="card">
            <h2 className="card-title">Historique des Transferts</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '15px' }} />
                <input 
                  type="text" 
                  className="input-control" 
                  style={{ paddingLeft: '40px', width: '100%', minHeight: '48px', margin: 0 }}
                  placeholder="Rechercher par compte, motif..." 
                  value={searchTresTerm} 
                  onChange={e => setSearchTresTerm(e.target.value)} 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Du</label>
                  <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateDebutTres} onChange={e => setDateDebutTres(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Au</label>
                  <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateFinTres} onChange={e => setDateFinTres(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(() => {
                const filteredTransferHistory = transferHistory.filter(tx => {
                  const dStr = tx.date.substring(0, 10);
                  if (dateDebutTres && dStr < dateDebutTres) return false;
                  if (dateFinTres && dStr > dateFinTres) return false;
                  if (searchTresTerm) {
                    const st = searchTresTerm.toLowerCase();
                    const accFrom = accountsList.find(a => a.id === tx.fromAccount)?.label || tx.fromAccount || '';
                    const accTo = accountsList.find(a => a.id === tx.toAccount)?.label || tx.toAccount || '';
                    return accFrom.toLowerCase().includes(st) || 
                           accTo.toLowerCase().includes(st) || 
                           (tx.motif || '').toLowerCase().includes(st);
                  }
                  return true;
                });

                if (filteredTransferHistory.length === 0) {
                  return <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Aucun transfert trouvé.</p>;
                }
                return filteredTransferHistory.map(tx => {
                  const d = new Date(tx.date);
                  const accFromLabel = accountsList.find(a => a.id === tx.fromAccount)?.label || tx.fromAccount;
                  const accToLabel = accountsList.find(a => a.id === tx.toAccount)?.label || tx.toAccount;
                  
                  return (
                    <div key={tx.id} style={{
                      backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '12px',
                      display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {d.toLocaleDateString('fr-FR')} {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute:'2-digit' })}
                        </span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                          {Number(tx.montant).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem' }}>
                        <span style={{ fontWeight: '600' }}>{accFromLabel}</span>
                        <ArrowRightLeft size={14} color="var(--text-muted)" />
                        <span style={{ fontWeight: '600' }}>{accToLabel}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {tx.motif}
                        {tx.saisieParNom && (
                          <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>— Par : {tx.saisieParNom}</span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* HISTORIQUE JOURNALIER DE LA TRESORERIE */}
        {activeTab === 'journalier' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Calendar size={24} color="var(--accent-color)" />
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Journal de Trésorerie</h2>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Suivi chronologique des soldes depuis le 1er septembre 2026.
            </p>

            <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(() => {
                const startDate = '2026-09-01';
                
                const getModeKey = (m) => {
                  if (!m) return 'cash';
                  const lower = m.toLowerCase();
                  if (lower.includes('visa')) return 'visa';
                  if (lower.includes('nita')) return 'nita';
                  if (lower.includes('amana')) return 'amana';
                  if (lower.includes('cash')) return 'cash';
                  return 'autre';
                };
                
                const items = [];
                const globalTotals = { 
                  cash: { in: 0, out: 0 }, nita: { in: 0, out: 0 }, 
                  amana: { in: 0, out: 0 }, visa: { in: 0, out: 0 }, autre: { in: 0, out: 0 }
                };
                
                allTransactions.forEach(t => {
                  const dStr = (t.date || '').substring(0, 10);
                  if (dStr >= startDate) {
                    if (t.type === 'transfert') {
                      items.push({ date: dStr, type: 'transfert', montant: Number(t.montant) || 0, from: getModeKey(t.fromAccount), to: getModeKey(t.toAccount) });
                    } else {
                      items.push({ date: dStr, type: t.type, categorie: t.categorie || 'Autre', montant: Number(t.montant) || 0, motif: t.motif, mode: getModeKey(t.modePaiement) });
                    }
                  }
                });
                
                allAvances.forEach(a => {
                  const dStr = (a.date || '').substring(0, 10);
                  if (dStr >= startDate) {
                    items.push({ date: dStr, type: 'avance', categorie: 'Avances sur salaires', montant: Number(a.montant) || 0, motif: a.motif, mode: getModeKey(a.modePaiement) });
                  }
                });
                
                const grouped = {};
                items.forEach(item => {
                  if (!grouped[item.date]) {
                    grouped[item.date] = { 
                      entrees: 0, sorties: 0, 
                      details: { entrees: {}, sorties: {} },
                      modes: { 
                        cash: { entrees: 0, sorties: 0 }, nita: { entrees: 0, sorties: 0 }, 
                        amana: { entrees: 0, sorties: 0 }, visa: { entrees: 0, sorties: 0 }, autre: { entrees: 0, sorties: 0 } 
                      }
                    };
                  }
                  
                  const g = grouped[item.date];
                  
                  if (item.type === 'transfert') {
                     if (g.modes[item.from]) g.modes[item.from].sorties += item.montant;
                     if (g.modes[item.to]) g.modes[item.to].entrees += item.montant;
                  } else {
                    const mKey = item.mode || 'cash';
                    if (!g.modes[mKey]) g.modes[mKey] = { entrees: 0, sorties: 0 };
                    
                    if (item.type === 'prestation') {
                      g.entrees += item.montant;
                      g.modes[mKey].entrees += item.montant;
                      globalTotals[mKey].in += item.montant;
                      g.details.entrees['Prestations'] = (g.details.entrees['Prestations'] || 0) + item.montant;
                    } else if (item.type === 'depense') {
                      g.sorties += item.montant;
                      g.modes[mKey].sorties += item.montant;
                      globalTotals[mKey].out += item.montant;
                      const cat = item.categorie || 'Dépenses diverses';
                      g.details.sorties[cat] = (g.details.sorties[cat] || 0) + item.montant;
                    } else if (item.type === 'avance') {
                      g.sorties += item.montant;
                      g.modes[mKey].sorties += item.montant;
                      globalTotals[mKey].out += item.montant;
                      g.details.sorties['Avances sur salaires'] = (g.details.sorties['Avances sur salaires'] || 0) + item.montant;
                    } else if (item.type === 'ajustement') {
                      if (item.montant > 0) {
                        g.entrees += item.montant;
                        g.modes[mKey].entrees += item.montant;
                        globalTotals[mKey].in += item.montant;
                        g.details.entrees['Ajustements (Erreur/Ajout)'] = (g.details.entrees['Ajustements (Erreur/Ajout)'] || 0) + item.montant;
                      } else {
                        g.sorties += Math.abs(item.montant);
                        g.modes[mKey].sorties += Math.abs(item.montant);
                        globalTotals[mKey].out += Math.abs(item.montant);
                        g.details.sorties['Ajustements (Erreur/Retrait)'] = (g.details.sorties['Ajustements (Erreur/Retrait)'] || 0) + Math.abs(item.montant);
                      }
                    }
                  }
                });
                
                const sortedDates = Object.keys(grouped).sort();
                
                let runningBalanceTotal = 0;
                let runningBalancesModes = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
                const historyList = [];
                
                sortedDates.forEach(dStr => {
                  const dayData = grouped[dStr];
                  const ouverture = runningBalanceTotal;
                  runningBalanceTotal = ouverture + dayData.entrees - dayData.sorties;
                  
                  const endBalances = {};
                  accountsList.forEach(acc => {
                    const id = acc.id;
                    runningBalancesModes[id] = runningBalancesModes[id] + dayData.modes[id].entrees - dayData.modes[id].sorties;
                    endBalances[id] = runningBalancesModes[id];
                  });

                  historyList.push({
                    date: dStr,
                    ouverture,
                    entrees: dayData.entrees,
                    sorties: dayData.sorties,
                    cloture: runningBalanceTotal,
                    details: dayData.details,
                    modes: dayData.modes,
                    endBalances: endBalances
                  });
                });
                
                historyList.reverse();
                
                return (
                  <>
                    <div style={{ backgroundColor: 'var(--bg-input)', padding: '15px', borderRadius: '12px', marginBottom: '15px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Sous-totaux Globaux par Canal (depuis {startDate})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                        {accountsList.map(acc => {
                          const id = acc.id;
                          const tIn = globalTotals[id].in;
                          const tOut = globalTotals[id].out;
                          const net = tIn - tOut;
                          if (tIn === 0 && tOut === 0) return null;
                          return (
                            <div key={id} style={{ backgroundColor: 'var(--bg-main)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '0.9rem' }}>{acc.label}</div>
                              <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Encaissé</span>
                                <span style={{ color: 'var(--success)' }}>{tIn.toLocaleString('fr-FR')}</span>
                              </div>
                              <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Décaissé</span>
                                <span style={{ color: 'var(--danger)' }}>{tOut.toLocaleString('fr-FR')}</span>
                              </div>
                              <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '4px', fontWeight: 'bold' }}>
                                <span>Net</span>
                                <span>{net.toLocaleString('fr-FR')} F</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {historyList.length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Aucune donnée journalière trouvée depuis le {startDate}.</p>
                    ) : (
                      historyList.map((day, idx) => {
                        const d = new Date(day.date);
                        const isExpanded = expandedDay === day.date;
                        
                        return (
                          <div key={day.date} style={{
                            backgroundColor: 'var(--bg-input)', borderRadius: '12px', marginBottom: '12px',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            border: isExpanded ? '1px solid var(--accent-color)' : '1px solid transparent',
                            transition: 'border 0.3s ease'
                          }}>
                            <div 
                              onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                              style={{ padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                                <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1rem', textTransform: 'capitalize' }}>
                                  {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                                  {isExpanded ? 'Fermer' : 'Détails'}
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </span>
                              </div>
                              
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                                <div>
                                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Ouverture</div>
                                  <div style={{ fontWeight: '600' }}>{day.ouverture.toLocaleString('fr-FR')} F</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Entrées</div>
                                  <div style={{ fontWeight: '600', color: 'var(--success)' }}>+{day.entrees.toLocaleString('fr-FR')} F</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Sorties</div>
                                  <div style={{ fontWeight: '600', color: 'var(--danger)' }}>-{day.sorties.toLocaleString('fr-FR')} F</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Clôture (Net)</div>
                                  <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: day.cloture >= 0 ? 'var(--accent-color)' : 'var(--danger)' }}>
                                    {day.cloture.toLocaleString('fr-FR')} F
                                  </div>
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)' }}>
                                
                                <div style={{ marginBottom: '20px' }}>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '10px' }}>
                                    Soldes de fin de journée par caisse
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {accountsList.map(acc => {
                                      const bal = day.endBalances[acc.id];
                                      if (!bal && day.modes[acc.id].entrees === 0 && day.modes[acc.id].sorties === 0) return null;
                                      return (
                                        <div key={acc.id} style={{ padding: '6px 10px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>{acc.label}:</span>
                                          <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{bal.toLocaleString('fr-FR')} F</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '12px' }}>Répartition du jour</div>
                                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                  
                                  <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ color: 'var(--success)', fontWeight: '600', marginBottom: '8px', borderBottom: '1px solid rgba(16,185,129,0.2)', paddingBottom: '4px' }}>Flux Entrants (Par Rubrique)</div>
                                    {Object.keys(day.details.entrees).length > 0 ? (
                                      Object.entries(day.details.entrees).map(([cat, montant]) => (
                                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                                          <span style={{ fontWeight: '500' }}>{montant.toLocaleString('fr-FR')} F</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune entrée</div>
                                    )}
                                  </div>

                                  <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ color: 'var(--danger)', fontWeight: '600', marginBottom: '8px', borderBottom: '1px solid rgba(239,68,68,0.2)', paddingBottom: '4px' }}>Flux Sortants (Par Rubrique)</div>
                                    {Object.keys(day.details.sorties).length > 0 ? (
                                      Object.entries(day.details.sorties).map(([cat, montant]) => (
                                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                                          <span style={{ fontWeight: '500' }}>{montant.toLocaleString('fr-FR')} F</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune sortie</div>
                                    )}
                                  </div>

                                  <div style={{ flex: 1, minWidth: '200px' }}>
                                    <div style={{ color: 'var(--accent-color)', fontWeight: '600', marginBottom: '8px', borderBottom: '1px solid rgba(59,130,246,0.2)', paddingBottom: '4px' }}>Mouvements par Canal (Incl. transferts)</div>
                                    {accountsList.map(acc => {
                                      const m = day.modes[acc.id];
                                      if (m.entrees === 0 && m.sorties === 0) return null;
                                      return (
                                        <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                          <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{acc.label}</span>
                                          <span style={{ display: 'flex', gap: '8px' }}>
                                            {m.entrees > 0 && <span style={{ color: 'var(--success)' }}>+{m.entrees.toLocaleString('fr-FR')}</span>}
                                            {m.sorties > 0 && <span style={{ color: 'var(--danger)' }}>-{m.sorties.toLocaleString('fr-FR')}</span>}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>

                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Tresorerie;
