import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, AlertTriangle, CheckCircle, ShieldAlert, Plus, Trash2, Calendar } from 'lucide-react';
import BulkActionBar from './BulkActionBar';

const RH = () => {
  const [employes, setEmployes] = useState([]);
  const [avances, setAvances] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthDepenses, setMonthDepenses] = useState(0);

  // Bulk Selection State
  const [selectedAvances, setSelectedAvances] = useState([]);

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
      let dep = 0;
      snap.docs.forEach(d => {
        const t = d.data();
        if (t.date >= startOfMonth) {
          if (t.type === 'prestation') rev += Number(t.montant) || 0;
          if (t.type === 'depense') dep += Number(t.montant) || 0;
        }
      });
      setMonthRevenue(rev);
      setMonthDepenses(dep);
    });

    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), (snap) => {
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubEmp();
      unsubAvances();
      unsubTx();
      unsubCharges();
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

  const seedEmployes = async () => {
    const defaults = [
      { nom: 'Koby', salaireFixe: 150000, actif: true },
      { nom: 'Issouf', salaireFixe: 70000, actif: true },
      { nom: 'Nadia', salaireFixe: 50000, actif: true },
      { nom: 'Francis', salaireFixe: 50000, actif: true },
      { nom: 'Kime', salaireFixe: 50000, actif: true },
      { nom: 'Bacho', salaireFixe: 40000, actif: true },
      { nom: 'Raouf', salaireFixe: 30000, actif: true }
    ];
    for (const emp of defaults) {
      await addDoc(collection(db, 'employes'), emp);
    }
  };

  // Bulk Selection Helpers
  const toggleSelection = (id) => {
    setSelectedAvances(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleAll = (e) => {
    if (e.target.checked) setSelectedAvances(avances.map(a => a.id));
    else setSelectedAvances([]);
  };

  // Calculs Globaux Trésorerie
  const totalSalairesBruts = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const totalChargesFixes = chargesFixes.filter(c => c.actif).reduce((acc, c) => acc + (Number(c.montant) || 0), 0);
  const totalAvancesMois = avances.filter(a => a.date >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()).reduce((acc, a) => acc + Number(a.montant), 0);
  
  // Ventilation Globale
  const pctSalaires = monthRevenue > 0 ? Math.min((totalSalairesBruts / monthRevenue) * 100, 100) : 0;
  const pctDepenses = monthRevenue > 0 ? Math.min((monthDepenses / monthRevenue) * 100, 100) : 0;
  const resteMarge = Math.max(0, monthRevenue - totalSalairesBruts - monthDepenses);
  const pctMarge = monthRevenue > 0 ? (resteMarge / monthRevenue) * 100 : 0;

  // Simulateur Individuel d'Avance
  let simStatus = null;
  let empSummary = null;

  if (formAvance.employeId) {
    const emp = employes.find(e => e.id === formAvance.employeId);
    if (emp) {
      const askAmount = Number(formAvance.montant) || 0;
      
      const plafondTotal = totalSalairesBruts + totalChargesFixes;
      const proportionCA = plafondTotal > 0 ? Math.min(monthRevenue / plafondTotal, 1) : 0;
      const plafondPrudent = emp.salaireFixe * proportionCA;
      
      const avancesDejaPrises = avances
        .filter(a => a.employeId === emp.id && a.date >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .reduce((acc, a) => acc + Number(a.montant), 0);
        
      const restePlafond = Math.max(0, plafondPrudent - avancesDejaPrises);
      const totalDemande = avancesDejaPrises + askAmount;
      const pctConsomme = emp.salaireFixe > 0 ? (totalDemande / emp.salaireFixe) * 100 : 0;

      if (monthRevenue >= plafondTotal) {
        simStatus = {
          color: 'var(--success)', icon: <CheckCircle size={18} />,
          text: `VERT (Sécurisé) : Les recettes actuelles couvrent toutes les charges fixes et les salaires. Avance sans danger.`
        };
      } else if (askAmount > 0 && askAmount <= restePlafond) {
        simStatus = {
          color: '#F59E0B', icon: <AlertTriangle size={18} />,
          text: `ORANGE (Prudence) : L'avance est possible mais réduit la marge réservée aux charges fixes. Reste sous le plafond proportionnel.`
        };
      } else if (askAmount > 0 && askAmount > restePlafond) {
        simStatus = {
          color: 'var(--danger)', icon: <ShieldAlert size={18} />,
          text: `ROUGE (Alerte) : L'avance dépasse la part générée (${Math.round(plafondPrudent)} F) et menace le paiement des charges fixes ou d'autres salaires.`
        };
      }

      empSummary = {
        salaire: emp.salaireFixe,
        dejaPris: avancesDejaPrises,
        pct: pctConsomme
      };
    }
  }

  return (
    <div className="view-container">
      
      {employes.length === 0 && (
        <div style={{ padding: '20px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ marginBottom: '10px' }}>Aucun employé configuré.</p>
          <button onClick={seedEmployes} className="btn btn-primary">Initialiser les employés par défaut (440 000 FCFA)</button>
        </div>
      )}

      {/* VENTILATION & RÉPARTITION */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 className="card-title">Répartition des Recettes (Mois en cours)</h2>

        {/* Grille 3 colonnes : CA | Masse Salariale | Charges Fixes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>

          {/* CA Global */}
          <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>CA Encaissé</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{monthRevenue.toLocaleString('fr-FR')} F</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Total encaissé ce mois</div>
          </div>

          {/* Masse Salariale */}
          <div style={{ backgroundColor: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Masse Salariale — {employes.filter(e => e.actif).length} agents
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalSalairesBruts.toLocaleString('fr-FR')} F</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
              <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{monthRevenue > 0 ? Math.round((totalSalairesBruts / monthRevenue) * 100) : 0}%</span>
            </div>
            <div style={{ marginTop: '6px', height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
              <div style={{ height: '100%', width: `${Math.min(pctSalaires, 100)}%`, backgroundColor: 'var(--accent-color)', borderRadius: '4px' }} />
            </div>
            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(37,99,235,0.15)', paddingTop: '10px' }}>
              {employes.filter(e => e.actif).map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '2px 0' }}>
                  <span>{e.nom}</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{Number(e.salaireFixe).toLocaleString('fr-FR')} F</span>
                </div>
              ))}
            </div>
          </div>

          {/* Charges Fixes */}
          <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Charges Fixes Mensuelles</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--danger)' }}>{totalChargesFixes.toLocaleString('fr-FR')} F</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
              <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>{monthRevenue > 0 ? Math.round((totalChargesFixes / monthRevenue) * 100) : 0}%</span>
            </div>
            <div style={{ marginTop: '6px', height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
              <div style={{ height: '100%', width: `${Math.min(monthRevenue > 0 ? (totalChargesFixes / monthRevenue) * 100 : 0, 100)}%`, backgroundColor: 'var(--danger)', borderRadius: '4px' }} />
            </div>
            {chargesFixes.filter(c => c.actif).length > 0 ? (
              <div style={{ marginTop: '12px', borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: '10px' }}>
                {chargesFixes.filter(c => c.actif).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '2px 0' }}>
                    <span>{c.nom}</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{Number(c.montant).toLocaleString('fr-FR')} F</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Aucune charge configurée. Voir Paramètres.
              </div>
            )}
          </div>
        </div>

        {/* Jauge globale 4 segments */}
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-color)' }}>Salaires : {Math.round(pctSalaires)}%</span>
            <span style={{ color: 'var(--danger)' }}>Charges Fixes : {monthRevenue > 0 ? Math.round((totalChargesFixes / monthRevenue) * 100) : 0}%</span>
            <span style={{ color: 'hsl(30, 95%, 55%)' }}>Dépenses variables : {Math.round(pctDepenses)}%</span>
            <span style={{ color: 'var(--success)' }}>Marge restante : {Math.round(pctMarge)}%</span>
          </div>
          <div style={{ width: '100%', height: '14px', display: 'flex', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ width: `${pctSalaires}%`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${monthRevenue > 0 ? Math.min((totalChargesFixes / monthRevenue) * 100, 100) : 0}%`, backgroundColor: 'var(--danger)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${pctDepenses}%`, backgroundColor: 'hsl(30, 95%, 55%)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${pctMarge}%`, backgroundColor: 'var(--success)', transition: 'width 0.5s ease' }} />
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
                  <option key={emp.id} value={emp.id}>{emp.nom}</option>
                ))}
              </select>
            </div>

            {empSummary && (
              <div style={{ backgroundColor: 'var(--bg-primary)', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Salaire de base :</span>
                  <span style={{ fontWeight: 'bold' }}>{empSummary.salaire.toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Avances déjà accordées :</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{empSummary.dejaPris.toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>CA consommé :</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '60px', height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                      <div style={{ height: '100%', width: `${Math.min(empSummary.pct, 100)}%`, backgroundColor: empSummary.pct > 100 ? 'var(--danger)' : 'var(--accent-color)', borderRadius: '4px' }} />
                    </div>
                    <span style={{ fontWeight: 'bold', color: empSummary.pct > 100 ? 'var(--danger)' : 'var(--text-main)' }}>{Math.round(empSummary.pct)}%</span>
                  </div>
                </div>
              </div>
            )}
            
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

            {simStatus && (
              <div style={{
                padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem',
                backgroundColor: 'var(--bg-input)', color: simStatus.color, display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <div>{simStatus.icon}</div>
                <div style={{ fontWeight: '600', lineHeight: '1.4' }}>{simStatus.text}</div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement...' : <><Plus size={18} /> Enregistrer l'avance</>}
            </button>
          </form>
        </div>

        {/* HISTORIQUE DES AVANCES */}
        <div className="card" style={{ flex: 2, minWidth: '350px' }}>
          <h2 className="card-title">Historique des Avances</h2>
          
          <BulkActionBar 
            selectedIds={selectedAvances} 
            collectionName="avances_salaires" 
            onClearSelection={() => setSelectedAvances([])} 
          />

          <div className="desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '12px 10px', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      onChange={toggleAll}
                      checked={avances.length > 0 && selectedAvances.length === avances.length}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '12px 10px' }}>Date</th>
                  <th style={{ padding: '12px 10px' }}>Employé</th>
                  <th style={{ padding: '12px 10px' }}>Montant</th>
                  <th style={{ padding: '12px 10px' }}>Mode</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {avances.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Aucune avance enregistrée.</td></tr>
                ) : (
                  avances.map(av => {
                    const d = new Date(av.date);
                    return (
                      <tr key={av.id} style={{ 
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: selectedAvances.includes(av.id) ? 'rgba(37,99,235,0.05)' : 'transparent'
                      }}>
                        <td style={{ padding: '12px 10px' }}>
                          <input 
                            type="checkbox"
                            checked={selectedAvances.includes(av.id)}
                            onChange={() => toggleSelection(av.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
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
