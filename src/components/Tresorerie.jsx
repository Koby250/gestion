import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Wallet, ArrowRightLeft, Edit2, CheckCircle } from 'lucide-react';
import { logEvent } from '../utils/audit';

const accountsList = [
  { id: 'cash', label: 'Cash (Espèces)' },
  { id: 'nita', label: 'Nita Cash' },
  { id: 'amana', label: 'Amana' },
  { id: 'visa', label: 'Carte VISA / Banque' },
  { id: 'autre', label: 'Autre' }
];

const Tresorerie = ({ activeDate = new Date().toISOString().substring(0, 10) }) => {
  const [soldes, setSoldes] = useState({ cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 });
  
  // Editing state
  const [editingAccount, setEditingAccount] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Transfer state
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMsg, setTransferMsg] = useState(null);

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
      txData = snapshot.docs.map(d => d.data());
      calcTheo();
    });

    const unsubAv = onSnapshot(collection(db, 'avances_salaires'), (snapshot) => {
      avancesData = snapshot.docs.map(d => d.data());
      calcTheo();
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
        date: getTransactionDate()
      });

      await logEvent('TRESORERIE_TRANSFERT', `Transfert de ${amount} FCFA de [${accFrom}] vers [${accTo}]`);
      
      setTransferAmount('');
      setTransferFrom('');
      setTransferTo('');
      setTransferMsg({ type: 'success', text: 'Transfert effectué avec succès.' });
      setTimeout(() => setTransferMsg(null), 3000);
    } catch {
      setTransferMsg({ type: 'error', text: 'Erreur lors du transfert.' });
    }
  };

  return (
    <div className="view-container">
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        
        {/* VUE D'ENSEMBLE */}
        <div className="card" style={{ flex: 2, minWidth: '300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Wallet size={24} color="var(--accent-color)" />
            <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Soldes des Comptes</h2>
          </div>

          <div style={{ backgroundColor: 'var(--bg-input)', padding: '20px', borderRadius: '12px', marginBottom: '25px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Solde Total Actuel</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalReel.toLocaleString('fr-FR')} FCFA</div>
            </div>
          </div>

          <div className="desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '12px 10px' }}>Compte</th>
                  <th style={{ padding: '12px 10px' }}>Solde Actuel</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {accountsList.map(acc => {
                  const sReal = Number(soldes[acc.id]) || 0;
                  return (
                    <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '15px 10px', fontWeight: '600', color: 'var(--text-main)' }}>{acc.label}</td>
                      <td style={{ padding: '15px 10px' }}>
                        {editingAccount === acc.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                              type="number" 
                              className="input-control" 
                              style={{ width: '120px', padding: '6px' }}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                            />
                            <button onClick={() => handleUpdateSolde(acc.id)} className="btn btn-success btn-small" title="Valider">
                              <CheckCircle size={14} />
                            </button>
                            <button onClick={() => setEditingAccount(null)} className="btn btn-small" style={{ background: 'var(--bg-input)' }}>
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                              {sReal.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '15px 10px', textAlign: 'right' }}>
                        {editingAccount !== acc.id && (
                          <button 
                            onClick={() => { setEditingAccount(acc.id); setEditValue(sReal); }}
                            className="btn btn-small"
                            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                          >
                            <Edit2 size={14} /> Ajuster
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TRANSFERT */}
        <div className="card" style={{ flex: 1, minWidth: '280px', alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <ArrowRightLeft size={20} color="var(--accent-color)" />
            <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Transfert interne</h2>
          </div>
          
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Déplacer des fonds d'un compte à un autre (ex: dépôt Cash vers Nita).
          </p>

          {transferMsg && (
            <div style={{
              padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem',
              backgroundColor: transferMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: transferMsg.type === 'success' ? 'var(--success)' : 'var(--danger)'
            }}>
              {transferMsg.text}
            </div>
          )}

          <form onSubmit={handleTransfer}>
            <div className="form-group">
              <label>Compte Source (Débiter)</label>
              <select className="input-control" value={transferFrom} onChange={e => setTransferFrom(e.target.value)} required>
                <option value="">-- Sélectionner --</option>
                {accountsList.map(a => (
                  <option key={a.id} value={a.id}>{a.label} ({Number(soldes[a.id]||0).toLocaleString('fr-FR')} F)</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Compte Destination (Créditer)</label>
              <select className="input-control" value={transferTo} onChange={e => setTransferTo(e.target.value)} required>
                <option value="">-- Sélectionner --</option>
                {accountsList.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Montant (FCFA)</label>
              <input 
                type="number" 
                className="input-control" 
                value={transferAmount} 
                onChange={e => setTransferAmount(e.target.value)} 
                required 
                placeholder="ex: 20000"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
              <ArrowRightLeft size={18} /> Transférer
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default Tresorerie;
