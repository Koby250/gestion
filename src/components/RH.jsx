import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, AlertTriangle, CheckCircle, ShieldAlert, Plus, Trash2, Calendar } from 'lucide-react';

const RH = () => {
  const [employes, setEmployes] = useState([]);
  const [avances, setAvances] = useState([]);
  const [monthRevenue, setMonthRevenue] = useState(0);

  const [formAvance, setFormAvance] = useState({
    employeId: '',
    montant: '',
    date: new Date().toISOString().substring(0, 10),
    modePaiement: 'cash',
    motif: 'Avance sur salaire'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    // 1. Fetch Employés
    const unsubEmp = onSnapshot(collection(db, 'employes'), (snap) => {
      setEmployes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch Avances
    const qAvances = query(collection(db, 'avances_salaires'), orderBy('date', 'desc'));
    const unsubAvances = onSnapshot(qAvances, (snap) => {
      setAvances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Fetch CA mensuel pour l'indicateur
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const unsubTx = onSnapshot(collection(db, 'transactions'), (snap) => {
      let rev = 0;
      snap.docs.forEach(d => {
        const t = d.data();
        if (t.type === 'prestation' && t.date >= startOfMonth) {
          rev += Number(t.montant) || 0;
        }
      });
      setMonthRevenue(rev);
    });

    return () => {
      unsubEmp();
      unsubAvances();
      unsubTx();
    };
  }, []);

  const handleAddAvance = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!formAvance.employeId || !formAvance.montant || !formAvance.date) {
      setMsg({ type: 'error', text: 'Veuillez remplir tous les champs obligatoires.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const emp = employes.find(emp => emp.id === formAvance.employeId);
      await addDoc(collection(db, 'avances_salaires'), {
        employeId: formAvance.employeId,
        employeNom: emp ? emp.nom : 'Inconnu',
        montant: Number(formAvance.montant),
        date: new Date(formAvance.date).toISOString(),
        modePaiement: formAvance.modePaiement,
        motif: formAvance.motif,
        createdAt: new Date().toISOString()
      });
      
      setFormAvance({ ...formAvance, montant: '', motif: 'Avance sur salaire' });
      setMsg({ type: 'success', text: 'Avance enregistrée avec succès.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: 'Erreur lors de l\'enregistrement.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Voulez-vous supprimer cette avance ?')) {
      await deleteDoc(doc(db, 'avances_salaires', id));
    }
  };

  // Calculs Sécurité Trésorerie
  const totalSalairesBruts = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const ratio = totalSalairesBruts > 0 ? (monthRevenue / totalSalairesBruts) : 0;
  
  let securityStatus = { color: 'var(--text-muted)', icon: <AlertTriangle />, text: 'Données insuffisantes', bg: 'var(--bg-input)' };
  
  if (totalSalairesBruts > 0) {
    if (ratio < 1) {
      securityStatus = { color: 'var(--danger)', icon: <ShieldAlert size={20} />, text: 'Attention : recettes insuffisantes pour couvrir les salaires.', bg: 'rgba(239, 68, 68, 0.1)' };
    } else if (ratio >= 1 && ratio <= 1.5) {
      securityStatus = { color: '#F59E0B', icon: <AlertTriangle size={20} />, text: 'Capacité limitée : trésorerie juste suffisante.', bg: 'rgba(245, 158, 11, 0.1)' };
    } else {
      securityStatus = { color: 'var(--success)', icon: <CheckCircle size={20} />, text: 'Trésorerie saine : avance possible.', bg: 'rgba(16, 185, 129, 0.1)' };
    }
  }

  return (
    <div className="view-container">
      
      {/* INDICATEUR DE SÉCURITÉ */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 className="card-title">Indicateur de Sécurité Trésorerie (Mois en cours)</h2>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Recettes du mois</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{monthRevenue.toLocaleString('fr-FR')} FCFA</div>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Salaires de référence</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{totalSalairesBruts.toLocaleString('fr-FR')} FCFA</div>
          </div>
          <div style={{ flex: 2, minWidth: '300px', backgroundColor: securityStatus.bg, padding: '15px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ color: securityStatus.color }}>{securityStatus.icon}</div>
            <div>
              <div style={{ fontWeight: 'bold', color: securityStatus.color }}>Ratio : {ratio.toFixed(2)}</div>
              <div style={{ fontSize: '0.9rem', color: securityStatus.color }}>{securityStatus.text}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        
        {/* FORMULAIRE AVANCE */}
        <div className="card" style={{ flex: 1, minWidth: '300px', alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Users size={20} color="var(--accent-color)" />
            <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Nouvelle Avance</h2>
          </div>

          {msg && (
            <div style={{
              padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem',
              backgroundColor: msg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: msg.type === 'success' ? 'var(--success)' : 'var(--danger)'
            }}>
              {msg.text}
            </div>
          )}

          <form onSubmit={handleAddAvance}>
            <div className="form-group">
              <label>Employé</label>
              <select className="input-control" value={formAvance.employeId} onChange={e => setFormAvance({...formAvance, employeId: e.target.value})} required>
                <option value="">-- Sélectionner --</option>
                {employes.filter(emp => emp.actif).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nom} (Sal: {Number(emp.salaireFixe||0).toLocaleString('fr-FR')} F)</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Montant (FCFA)</label>
              <input type="number" className="input-control" value={formAvance.montant} onChange={e => setFormAvance({...formAvance, montant: e.target.value})} required />
            </div>

            <div className="form-group">
              <label>Mode de paiement</label>
              <select className="input-control" value={formAvance.modePaiement} onChange={e => setFormAvance({...formAvance, modePaiement: e.target.value})} required>
                <option value="cash">Cash (Espèces)</option>
                <option value="nita">Nita Cash</option>
                <option value="amana">Amana</option>
                <option value="visa">Carte VISA / Banque</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div className="form-group">
              <label>Date</label>
              <input type="date" className="input-control" value={formAvance.date} onChange={e => setFormAvance({...formAvance, date: e.target.value})} required />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement...' : <><Plus size={18} /> Enregistrer l'avance</>}
            </button>
          </form>
        </div>

        {/* HISTORIQUE DES AVANCES */}
        <div className="card" style={{ flex: 2, minWidth: '350px' }}>
          <h2 className="card-title">Historique des Avances</h2>
          <div className="desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '12px 10px' }}>Date</th>
                  <th style={{ padding: '12px 10px' }}>Employé</th>
                  <th style={{ padding: '12px 10px' }}>Montant</th>
                  <th style={{ padding: '12px 10px' }}>Mode</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {avances.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Aucune avance enregistrée.</td></tr>
                ) : (
                  avances.map(av => {
                    const d = new Date(av.date);
                    return (
                      <tr key={av.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 10px' }}>{d.toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '12px 10px', fontWeight: '600' }}>{av.employeNom}</td>
                        <td style={{ padding: '12px 10px', color: 'var(--accent-color)', fontWeight: 'bold' }}>{Number(av.montant).toLocaleString('fr-FR')} FCFA</td>
                        <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>{av.modePaiement}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                          <button onClick={() => handleDelete(av.id)} className="btn btn-small btn-danger" title="Supprimer">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default RH;
