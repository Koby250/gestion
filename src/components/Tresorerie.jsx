import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Wallet, ArrowRightLeft, Edit2, CheckCircle, AlertCircle } from 'lucide-react';
import { logEvent } from '../utils/audit';

const accountsList = [
  { id: 'cash', label: 'Cash (Espèces)' },
  { id: 'nita', label: 'Nita Cash' },
  { id: 'amana', label: 'Amana' },
  { id: 'visa', label: 'Carte VISA / Banque' },
  { id: 'autre', label: 'Autre' }
];

const Tresorerie = () => {
  const [soldes, setSoldes] = useState({ cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 });
  const [theorique, setTheorique] = useState({ cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 });
  
  // Editing state
  const [editingAccount, setEditingAccount] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Transfer state
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMsg, setTransferMsg] = useState(null);

  useEffect(() => {
    // 1. Fetch real balances
    const unsubSoldes = onSnapshot(doc(db, 'tresorerie', 'soldes'), (docSnap) => {
      if (docSnap.exists()) {
        setSoldes({ cash: 0, nita: 0, amana: 0, visa: 0, autre: 0, ...docSnap.data() });
      }
    });

    // 2. Calculate theoretical from this month's transactions
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const unsubTx = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const theo = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
      snapshot.docs.forEach(d => {
        const t = d.data();
        if (t.date >= startOfMonth) {
          const mode = (t.modePaiement || 'cash').toLowerCase();
          const amount = Number(t.montant) || 0;
          if (t.type === 'prestation') {
            if (theo[mode] !== undefined) theo[mode] += amount;
            else theo.autre += amount;
          } else if (t.type === 'depense') {
            if (theo[mode] !== undefined) theo[mode] -= amount;
            else theo.autre -= amount;
          }
        }
      });
      setTheorique(theo);
    });

    return () => {
      unsubSoldes();
      unsubTx();
    };
  }, []);

  const totalReel = Object.values(soldes).reduce((a, b) => a + Number(b), 0);
  const totalTheorique = Object.values(theorique).reduce((a, b) => a + Number(b), 0);

  const handleUpdateSolde = async (accountId) => {
    const newVal = Number(editValue);
    if (isNaN(newVal)) return;
    
    const oldVal = Number(soldes[accountId] || 0);
    const newSoldes = { ...soldes, [accountId]: newVal };
    await setDoc(doc(db, 'tresorerie', 'soldes'), newSoldes, { merge: true });
    
    const accountName = accountsList.find(a => a.id === accountId)?.label || accountId;
    await logEvent('TRESORERIE_UPDATE', `Ajustement manuel du compte ${accountName}. Ancien: ${oldVal} F, Nouveau: ${newVal} F`);
    
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
      const newSoldes = { ...soldes };
      newSoldes[transferFrom] = Number(newSoldes[transferFrom]) - amount;
      newSoldes[transferTo] = Number(newSoldes[transferTo]) + amount;
      
      await setDoc(doc(db, 'tresorerie', 'soldes'), newSoldes, { merge: true });
      
      const accFrom = accountsList.find(a => a.id === transferFrom)?.label || transferFrom;
      const accTo = accountsList.find(a => a.id === transferTo)?.label || transferTo;
      await logEvent('TRESORERIE_TRANSFERT', `Transfert de ${amount} FCFA de [${accFrom}] vers [${accTo}]`);
      
      setTransferAmount('');
      setTransferFrom('');
      setTransferTo('');
      setTransferMsg({ type: 'success', text: 'Transfert effectué avec succès.' });
      setTimeout(() => setTransferMsg(null), 3000);
    } catch (err) {
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

          <div style={{ backgroundColor: 'var(--bg-input)', padding: '20px', borderRadius: '12px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Solde Total Réel</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{totalReel.toLocaleString('fr-FR')} FCFA</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Théorique (Mois)</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalTheorique.toLocaleString('fr-FR')} FCFA</div>
            </div>
          </div>

          <div className="desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '12px 10px' }}>Compte</th>
                  <th style={{ padding: '12px 10px' }}>Théorique (Mois)</th>
                  <th style={{ padding: '12px 10px' }}>Solde Réel</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {accountsList.map(acc => {
                  const sReal = Number(soldes[acc.id]) || 0;
                  const sTheo = Number(theorique[acc.id]) || 0;
                  const diff = sReal - sTheo;
                  return (
                    <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '15px 10px', fontWeight: '600', color: 'var(--text-main)' }}>{acc.label}</td>
                      <td style={{ padding: '15px 10px', color: 'var(--text-muted)' }}>{sTheo.toLocaleString('fr-FR')} FCFA</td>
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
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{sReal.toLocaleString('fr-FR')} FCFA</span>
                            {diff !== 0 && (
                              <span style={{ fontSize: '0.75rem', color: diff > 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <AlertCircle size={12} /> {diff > 0 ? '+' : ''}{diff.toLocaleString('fr-FR')}
                              </span>
                            )}
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
