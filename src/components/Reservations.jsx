import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Calendar, Clock, User, Phone,
  CheckCircle, AlertCircle, PlusCircle,
  Trash2, CreditCard, X, FileText, MessageSquare
} from 'lucide-react';
import { logEvent } from '../utils/audit';
import FactureModal from './FactureModal';

const Reservations = () => {
  // Collections state
  const [reservations, setReservations] = useState([]);
  const [services, setServices]         = useState([]);
  const [employes, setEmployes]         = useState([]);

  // Tabs state
  const [activeTab, setActiveTab] = useState('aujourd_hui');

  const [encaissementModal, setEncaissementModal] = useState(null);
  const [factureModal, setFactureModal]           = useState(null);
  const [modeEncaissement, setModeEncaissement]   = useState('Cash');
  const [encaissementLoading, setEncaissementLoading] = useState(false);

  // Form state
  const [clientNom,      setClientNom]      = useState('');
  const [clientTel,      setClientTel]      = useState('');
  const [serviceId,      setServiceId]      = useState('');
  const [datePrevue,     setDatePrevue]     = useState('');
  const [heurePrevue,    setHeurePrevue]    = useState('');
  const [employeId,      setEmployeId]      = useState('');
  const [optionPaiement, setOptionPaiement] = useState('a_payer');
  const [montantAcompte, setMontantAcompte] = useState('');
  const [modePaiement,   setModePaiement]   = useState('Cash');
  const [notes,          setNotes]          = useState('');

  // ── Chargement des données Firestore ──────────────────────────────────────
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), snap =>
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.actif))
    );
    const unsubEmployes = onSnapshot(collection(db, 'employes'), snap =>
      setEmployes(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.actif))
    );
    const q = query(collection(db, 'reservations'), orderBy('datePrevue', 'asc'));
    const unsubReservations = onSnapshot(q, snap =>
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubServices(); unsubEmployes(); unsubReservations(); };
  }, []);

  // ── Créer une réservation ─────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!clientNom || !serviceId || !datePrevue || !heurePrevue || !employeId) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    const service = services.find(s => s.id === serviceId);
    const employe = employes.find(emp => emp.id === employeId);
    if (!service || !employe) return;

    const prixTotal = Number(service.prixDefaut);
    let statut      = 'non_paye';
    let acomptePaye = 0;
    const nowISO    = new Date().toISOString();

    try {
      if (optionPaiement === 'avance') {
        statut      = 'encaisse';
        acomptePaye = prixTotal;
        await addDoc(collection(db, 'transactions'), {
          type: 'prestation',
          montant: prixTotal,
          motif: `Réservation d'avance - ${clientNom} (${service.nom})`,
          employeId: employe.id,
          employeNom: employe.nom,
          modePaiement,
          date: nowISO
        });
        console.log('[Reservations] Transaction avance créée.');

      } else if (optionPaiement === 'acompte') {
        if (!montantAcompte || isNaN(Number(montantAcompte))) {
          alert("Veuillez entrer un montant d'acompte valide.");
          return;
        }
        const montantAc = Number(montantAcompte);
        if (montantAc >= prixTotal) {
          statut      = 'encaisse';
          acomptePaye = prixTotal;
        } else {
          statut      = 'acompte_verse';
          acomptePaye = montantAc;
        }
        await addDoc(collection(db, 'transactions'), {
          type: 'prestation',
          montant: acomptePaye,
          motif: `Acompte réservation - ${clientNom} (${service.nom})`,
          employeId: employe.id,
          employeNom: employe.nom,
          modePaiement,
          date: nowISO
        });
        console.log('[Reservations] Transaction acompte créée.');
      }

      await addDoc(collection(db, 'reservations'), {
        clientNom, clientTel, serviceId,
        serviceNom: service.nom, prixTotal,
        datePrevue, heurePrevue,
        employeId, employeNom: employe.nom,
        statut, acomptePaye,
        notes: notes.trim(),
        createdAt: nowISO
      });
      console.log('[Reservations] Réservation créée avec statut:', statut);
      
      await logEvent('RESERVATION_CREATE', `Réservation pour ${clientNom} (${service.nom}) par ${employe.nom}. Statut: ${statut}`);

    } catch (err) {
      console.error('[Reservations] Erreur lors de la création:', err);
      alert('Une erreur est survenue. Vérifiez la console.');
      return;
    }

    // Reset formulaire
    setClientNom(''); setClientTel(''); setServiceId('');
    setDatePrevue(''); setHeurePrevue(''); setEmployeId('');
    setOptionPaiement('a_payer'); setMontantAcompte(''); setModePaiement('Cash');
    setNotes('');
  };

  // ── Ouvrir le modal d'encaissement ───────────────────────────────────────
  const handleEncaisserSolde = (res) => {
    setModeEncaissement('Cash');
    setEncaissementModal(res);
  };

  // ── Confirmer l'encaissement du solde ─────────────────────────────────────
  const handleConfirmerEncaissement = async () => {
    const res = encaissementModal;
    if (!res) return;

    const resteAPayer = res.prixTotal - (res.acomptePaye || 0);
    if (resteAPayer <= 0) {
      console.warn('[Reservations] Reste à payer nul, rien à encaisser.');
      setEncaissementModal(null);
      return;
    }

    setEncaissementLoading(true);
    try {
      // 1. Créer la transaction de solde dans la Caisse
      await addDoc(collection(db, 'transactions'), {
        type: 'prestation',
        montant: resteAPayer,
        motif: `Solde réservation - ${res.clientNom} (${res.serviceNom})`,
        employeId:  res.employeId,
        employeNom: res.employeNom,
        modePaiement: modeEncaissement,
        date: new Date().toISOString()
      });
      console.log('[Reservations] Transaction solde créée:', resteAPayer, 'FCFA via', modeEncaissement);

      await updateDoc(doc(db, 'reservations', res.id), {
        statut:      'encaisse',
        acomptePaye: res.prixTotal
      });
      console.log('[Reservations] Statut réservation mis à jour → encaisse');
      
      await logEvent('RESERVATION_UPDATE', `Encaissement du solde (${resteAPayer} FCFA) pour ${res.clientNom}. Mode: ${modeEncaissement}`);

    } catch (err) {
      console.error('[Reservations] Erreur lors de l\'encaissement:', err);
      alert('Erreur lors de l\'encaissement. Vérifiez la console.');
    } finally {
      setEncaissementLoading(false);
      setEncaissementModal(null);
    }
  };

  // ── Supprimer une réservation ─────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (window.confirm('Supprimer cette réservation ? Les transactions liées en caisse ne seront pas supprimées.')) {
      try {
        await deleteDoc(doc(db, 'reservations', id));
        console.log('[Reservations] Réservation supprimée:', id);
        await logEvent('RESERVATION_DELETE', `Suppression de la réservation ID: ${id}`);
      } catch (err) {
        console.error('[Reservations] Erreur suppression:', err);
      }
    }
  };

  // ── Filtrage des réservations selon l'onglet ──────────────────────────────
  const todayISO = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const filteredReservations = reservations.filter(res => {
    if (activeTab === 'aujourd_hui') return res.datePrevue === todayISO;
    if (activeTab === 'a_venir')    return res.datePrevue > todayISO;
    return res.datePrevue < todayISO;
  });

  // ── Helpers statut ────────────────────────────────────────────────────────
  const isNonEncaisse = (statut) => statut !== 'encaisse' && statut !== 'paye_totalement';

  const renderBadge = (res) => {
    const { statut, prixTotal, acomptePaye } = res;

    if (!isNonEncaisse(statut)) {
      return (
        <span style={{
          padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700',
          backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)',
          display: 'inline-flex', alignItems: 'center', gap: '6px'
        }}>
          <CheckCircle size={13} /> Encaissé
        </span>
      );
    }

    const reste = prixTotal - (acomptePaye || 0);
    const label = statut === 'acompte_verse'
      ? `Reste : ${reste} FCFA`
      : `Non encaissé — ${prixTotal} FCFA`;

    return (
      <span style={{
        padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700',
        backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)',
        display: 'inline-flex', alignItems: 'center', gap: '6px'
      }}>
        <AlertCircle size={13} /> {label}
      </span>
    );
  };

  // ── Options de paiement (sans émoji) ─────────────────────────────────────
  const paymentOptions = [
    { value: 'a_payer',  icon: <Clock size={15} />,       label: 'À payer le jour J' },
    { value: 'acompte',  icon: <CreditCard size={15} />,  label: 'Acompte aujourd\'hui' },
    { value: 'avance',   icon: <CheckCircle size={15} />, label: 'Payé en totalité aujourd\'hui' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="view-container">

        {/* ── FORMULAIRE D'AJOUT ────────────────────────────────────────── */}
        <div className="card">
          <h2 className="card-title">Nouvelle Réservation</h2>

          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>

              <div className="form-group">
                <label><User size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Client (Nom)</label>
                <input type="text" className="input-control" placeholder="Nom du client"
                  value={clientNom} onChange={e => setClientNom(e.target.value)} />
              </div>

              <div className="form-group">
                <label><Phone size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Téléphone</label>
                <input type="text" className="input-control" placeholder="Numéro (Optionnel)"
                  value={clientTel} onChange={e => setClientTel(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Service</label>
                <select className="input-control" value={serviceId} onChange={e => setServiceId(e.target.value)}>
                  <option value="">Sélectionner un service</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.nom} — {s.prixDefaut} FCFA</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Coiffeur assigné</label>
                <select className="input-control" value={employeId} onChange={e => setEmployeId(e.target.value)}>
                  <option value="">Sélectionner un coiffeur</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label><Calendar size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Date Prévue</label>
                <input type="date" className="input-control"
                  value={datePrevue} onChange={e => setDatePrevue(e.target.value)} />
              </div>

              <div className="form-group">
                <label><Clock size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Heure</label>
                <input type="time" className="input-control"
                  value={heurePrevue} onChange={e => setHeurePrevue(e.target.value)} />
              </div>

              {/* ── NOTES / COMMENTAIRES ───────────────────────────────── */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label><MessageSquare size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Notes / Commentaires (Optionnel)</label>
                <textarea
                  className="input-control"
                  placeholder="Ex: Coupe dégradée à blanc, cuir chevelu sensible..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* ── OPTIONS DE PAIEMENT ───────────────────────────────── */}
              <div style={{ gridColumn: '1 / -1', backgroundColor: 'var(--bg-input)', padding: '15px', borderRadius: '12px' }}>
                <label style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '600', display: 'block', marginBottom: '12px' }}>
                  Encaissement immédiat
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {paymentOptions.map(opt => (
                    <label key={opt.value} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                      padding: '8px 14px', borderRadius: '10px', border: '2px solid',
                      borderColor: optionPaiement === opt.value ? 'var(--accent-color)' : 'var(--border-color)',
                      backgroundColor: optionPaiement === opt.value ? 'rgba(37,99,235,0.07)' : 'var(--bg-card)',
                      color: optionPaiement === opt.value ? 'var(--accent-color)' : 'var(--text-muted)',
                      fontWeight: optionPaiement === opt.value ? '700' : '400',
                      transition: 'all 0.2s ease'
                    }}>
                      <input type="radio" name="paiement" value={opt.value}
                        checked={optionPaiement === opt.value}
                        onChange={e => setOptionPaiement(e.target.value)}
                        style={{ display: 'none' }} />
                      {opt.icon} {opt.label}
                    </label>
                  ))}
                </div>

                {(optionPaiement === 'acompte' || optionPaiement === 'avance') && (
                  <div style={{ display: 'flex', gap: '15px', marginTop: '15px', flexWrap: 'wrap' }}>
                    {optionPaiement === 'acompte' && (
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label>Montant de l'acompte (FCFA)</label>
                        <input type="number" className="input-control"
                          value={montantAcompte}
                          onChange={e => setMontantAcompte(e.target.value)}
                          style={{ backgroundColor: 'var(--bg-card)' }} />
                      </div>
                    )}
                    <div className="form-group" style={{ margin: 0, flex: 1 }}>
                      <label>Mode de paiement</label>
                      <select className="input-control" value={modePaiement}
                        onChange={e => setModePaiement(e.target.value)}
                        style={{ backgroundColor: 'var(--bg-card)' }}>
                        <option value="Cash">Cash</option>
                        <option value="NITA">NITA</option>
                        <option value="AMANA">AMANA</option>
                        <option value="Carte VISA">Carte VISA</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }}>
              <PlusCircle size={18} /> Ajouter la Réservation
            </button>
          </form>
        </div>

        {/* ── LISTE DES RÉSERVATIONS ────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 className="card-title" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>Agenda des Rendez-vous</h2>
            <div style={{ display: 'flex', gap: '5px', backgroundColor: 'var(--bg-input)', padding: '5px', borderRadius: '12px' }}>
              {[
                { key: 'aujourd_hui', label: "Aujourd'hui" },
                { key: 'a_venir',     label: 'À venir' },
                { key: 'historique',  label: 'Historique' },
              ].map(t => (
                <button key={t.key}
                  className={`nav-btn ${activeTab === t.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px' }}>Date & Heure</th>
                  <th style={{ padding: '10px' }}>Client</th>
                  <th style={{ padding: '10px' }}>Prestation</th>
                  <th style={{ padding: '10px' }}>Coiffeur</th>
                  <th style={{ padding: '10px' }}>Statut</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucune réservation pour cette période.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map(res => (
                    <tr key={res.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px', fontWeight: '500' }}>
                        {res.datePrevue} à {res.heurePrevue}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 'bold' }}>{res.clientNom}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.clientTel}</div>
                        {res.notes && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', marginTop: '4px', fontSize: '0.78rem',
                            color: 'var(--text-muted)', backgroundColor: 'rgba(37,99,235,0.06)',
                            padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(37,99,235,0.12)', maxWidth: '200px' }}>
                            <MessageSquare size={10} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent-color)' }} />
                            <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.notes}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>{res.serviceNom}</td>
                      <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{res.employeNom}</td>
                      <td style={{ padding: '10px' }}>{renderBadge(res)}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => setFactureModal(res)}
                            className="btn btn-small"
                            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                            title="Générer Facture"
                          >
                            <FileText size={14} /> Facture
                          </button>
                          {isNonEncaisse(res.statut) && (
                            <button
                              onClick={() => handleEncaisserSolde(res)}
                              className="btn btn-success btn-small"
                              title="Encaisser le solde"
                            >
                              <CreditCard size={14} /> Encaisser
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(res.id)}
                            className="btn btn-danger btn-small"
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── MODAL ENCAISSEMENT ────────────────────────────────────────────── */}
      {encaissementModal && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '32px',
            width: '100%', maxWidth: '420px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            border: '1px solid var(--border-color)'
          }}>
            {/* En-tête modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={20} color="var(--accent-color)" /> Encaissement du solde
              </h3>
              <button onClick={() => setEncaissementModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Client : <strong style={{ color: 'var(--text-main)' }}>{encaissementModal.clientNom}</strong>
              &nbsp;&mdash;&nbsp;{encaissementModal.serviceNom}
            </p>

            {/* Montant */}
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.07)', borderRadius: '14px',
              padding: '18px', marginBottom: '22px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Montant à encaisser
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: '800', color: 'var(--danger)', letterSpacing: '-0.02em' }}>
                {encaissementModal.prixTotal - (encaissementModal.acomptePaye || 0)} FCFA
              </div>
            </div>

            {/* Mode de paiement */}
            <div className="form-group">
              <label>Mode de règlement</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['Cash', 'NITA', 'AMANA', 'Carte VISA'].map(mode => (
                  <button key={mode} type="button"
                    onClick={() => setModeEncaissement(mode)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: '10px', border: '2px solid',
                      borderColor: modeEncaissement === mode ? 'var(--accent-color)' : 'var(--border-color)',
                      backgroundColor: modeEncaissement === mode ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-input)',
                      color: modeEncaissement === mode ? 'var(--accent-color)' : 'var(--text-muted)',
                      fontWeight: modeEncaissement === mode ? '700' : '500',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      fontSize: '0.9rem'
                    }}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions modal */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
              <button onClick={() => setEncaissementModal(null)}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
                disabled={encaissementLoading}>
                Annuler
              </button>
              <button onClick={handleConfirmerEncaissement}
                className="btn btn-success"
                style={{ flex: 2 }}
                disabled={encaissementLoading}>
                <CheckCircle size={17} />
                {encaissementLoading ? 'Enregistrement...' : "Confirmer l'encaissement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FACTURE ─────────────────────────────────────────────────── */}
      {factureModal && (
        <FactureModal 
          data={factureModal} 
          type="reservation" 
          onClose={() => setFactureModal(null)} 
        />
      )}
    </>
  );
};

export default Reservations;
