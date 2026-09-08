import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Calendar, Clock, User, Phone,
  CheckCircle, AlertCircle, PlusCircle,
  Trash2, CreditCard, X, FileText, MessageSquare, Edit2, Send, Search
} from 'lucide-react';
import { logEvent } from '../utils/audit';
import FactureModal from './FactureModal';
import BulkActionBar from './BulkActionBar';
import RechercheExpress from './RechercheExpress';
import AgendaVisuel from './AgendaVisuel';
import PanierPrestations from './PanierPrestations';

const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const Reservations = ({ activeDate = localDateStr() }) => {
  // Collections state
  const [reservations, setReservations] = useState([]);
  const [services, setServices]         = useState([]);
  const [employes, setEmployes]         = useState([]);

  // Tabs state
  const [activeTab, setActiveTab] = useState('aujourd_hui');
  const [viewMode, setViewMode]   = useState('liste'); // 'liste' | 'agenda'

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [eventDetailsModal, setEventDetailsModal] = useState(null);

  const [encaissementModal, setEncaissementModal] = useState(null);
  const [factureModal, setFactureModal]           = useState(null);
  const [notesModal, setNotesModal]               = useState(null);
  const [editModal, setEditModal]                 = useState(null);
  const [modeEncaissement, setModeEncaissement]   = useState('Cash');
  const [encaissementLoading, setEncaissementLoading] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Form state
  const [clientNom,      setClientNom]      = useState('');
  const [clientTel,      setClientTel]      = useState('');
  const [lignesPanier,   setLignesPanier]   = useState([{ 
    serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' 
  }]);
  const [datePrevue,     setDatePrevue]     = useState(activeDate);
  const [heurePrevue,    setHeurePrevue]    = useState('');
  const [optionPaiement, setOptionPaiement] = useState('a_payer');
  const [montantAcompte, setMontantAcompte] = useState('');
  const [modePaiement,   setModePaiement]   = useState('Cash');
  const [notes,          setNotes]          = useState('');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState([]);

  // Notes editing state
  const [editingNoteIndex, setEditingNoteIndex] = useState(null);
  const [editingNoteText, setEditingNoteText]   = useState('');

  // New Filters
  const [searchResTerm, setSearchResTerm] = useState('');
  const [dateDebutRes, setDateDebutRes] = useState('');
  const [dateFinRes, setDateFinRes] = useState('');



  const getTransactionDate = () => {
    const todayStr = localDateStr();
    if (activeDate === todayStr) {
      return new Date().toISOString();
    } else {
      const now = new Date();
      const retroDate = new Date(activeDate);
      retroDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      return retroDate.toISOString();
    }
  };

  // ── Chargement des données Firestore ──────────────────────────────────────
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), snap =>
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.actif))
    );
    const unsubEmployes = onSnapshot(collection(db, 'employes'), snap =>
      setEmployes(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => e.actif && e.categorie !== 'Support / Gestion')
      )
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
    if (!clientNom || !datePrevue || !heurePrevue || lignesPanier.length === 0 || !lignesPanier[0].serviceId) {
      alert('Veuillez remplir tous les champs obligatoires et choisir au moins une prestation.');
      return;
    }

    const prixTotal = lignesPanier.reduce((sum, l) => sum + Number(l.prixFinal || 0), 0);
    const prixBaseTotal = lignesPanier.reduce((sum, l) => sum + Number(l.prixBase || 0), 0);

    let statut      = 'non_paye';
    let acomptePaye = 0;
    const nowISO    = getTransactionDate();
    const serviceNoms = lignesPanier.map(l => l.serviceNom).join(', ');
    const motifTx = lignesPanier.length === 1 ? serviceNoms : `Forfait (${lignesPanier.length} prestations)`;
    // For legacy compat in tx, pick the first agent if any
    const firstAgent = lignesPanier[0]?.agents?.[0] || null;

    try {
      if (optionPaiement === 'avance') {
        statut      = 'encaisse';
        acomptePaye = prixTotal;
        await addDoc(collection(db, 'transactions'), {
          type: 'prestation',
          montant: prixTotal,
          motif: `Réservation d'avance - ${clientNom} (${motifTx})`,
          employeId: firstAgent ? firstAgent.id : '',
          employeNom: firstAgent ? firstAgent.nom : '',
          modePaiement,
          lignes: lignesPanier,
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
          motif: `Acompte réservation - ${clientNom} (${motifTx})`,
          employeId: firstAgent ? firstAgent.id : '',
          employeNom: firstAgent ? firstAgent.nom : '',
          modePaiement,
          lignes: lignesPanier,
          date: nowISO
        });
        console.log('[Reservations] Transaction acompte créée.');
      }

      await addDoc(collection(db, 'reservations'), {
        clientNom, clientTel,
        serviceNom: serviceNoms, 
        prixBase: prixBaseTotal,
        prixTotal,
        lignes: lignesPanier,
        datePrevue, heurePrevue,
        statut, acomptePaye,
        historiqueNotes: notes.trim() ? [{ texte: notes.trim(), date: nowISO }] : [],
        createdAt: nowISO
      });
      console.log('[Reservations] Réservation créée avec statut:', statut);
      
      await logEvent('RESERVATION_CREATE', `Réservation pour ${clientNom} (${motifTx}). Statut: ${statut}`);

    } catch (err) {
      console.error('[Reservations] Erreur lors de la création:', err);
      alert('Une erreur est survenue. Vérifiez la console.');
      return;
    }

    // Reset formulaire
    setClientNom(''); setClientTel('');
    setLignesPanier([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
    setDatePrevue(''); setHeurePrevue(''); 
    setOptionPaiement('a_payer'); setMontantAcompte(''); setModePaiement('Cash');
    setNotes('');
    setIsFormModalOpen(false);
  };

  // ── Callbacks pour l'Agenda ──────────────────────────────────────────────
  const handleTimeSlotClick = (dateStr, timeStr) => {
    setDatePrevue(dateStr);
    setHeurePrevue(timeStr);
    setViewMode('liste');
    setIsFormModalOpen(true);
  };

  const handleEventDrop = async (resId, newDateStr, newTimeStr) => {
    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, { datePrevue: newDateStr, heurePrevue: newTimeStr });
      logEvent('Déplacement Rendez-vous', `Res ID: ${resId} déplacé au ${newDateStr} à ${newTimeStr}`);
    } catch (e) {
      console.error(e);
      alert('Erreur lors du déplacement du rendez-vous.');
    }
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
        date: getTransactionDate()
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

  // ── Notes & Modifs ────────────────────────────────────────────────────────
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    try {
      const res = notesModal;
      const nowISO = getTransactionDate();
      const updatedNotes = [...(res.historiqueNotes || []), { texte: newNote.trim(), date: nowISO }];
      
      await updateDoc(doc(db, 'reservations', res.id), {
        historiqueNotes: updatedNotes
      });
      setNotesModal({ ...res, historiqueNotes: updatedNotes });
      setNewNote('');
    } catch (err) {
      console.error('[Reservations] Erreur lors de l\'ajout de la note:', err);
      alert("Erreur lors de l'ajout de la note. Veuillez réessayer.");
    }
  };

  const handleSaveEditedNote = async (index) => {
    if (!editingNoteText.trim()) return;
    try {
      const res = notesModal;
      const updatedNotes = [...(res.historiqueNotes || [])];
      updatedNotes[index] = { ...updatedNotes[index], texte: editingNoteText.trim() };
      
      await updateDoc(doc(db, 'reservations', res.id), {
        historiqueNotes: updatedNotes
      });
      setNotesModal({ ...res, historiqueNotes: updatedNotes });
      setEditingNoteIndex(null);
      setEditingNoteText('');
    } catch (err) {
      console.error('[Reservations] Erreur lors de la modification de la note:', err);
      alert("Erreur lors de la modification de la note. Veuillez réessayer.");
    }
  };

  const handleOpenEditModal = (res) => {
    let lignes = res.lignes;
    if (!lignes || lignes.length === 0) {
      lignes = [{
        serviceId: res.serviceId || '',
        serviceNom: res.serviceNom || '',
        prixBase: res.prixBase || 0,
        prixFinal: res.prixTotal || 0,
        agents: res.employeId ? [{ id: res.employeId, nom: res.employeNom }] : [],
        remiseType: res.reductionType || 'aucune',
        remiseValeur: res.reductionValeur || '',
        remiseMotif: res.reductionMotif || ''
      }];
    }
    setEditModal({ ...res, lignes });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editModal.lignes || editModal.lignes.length === 0 || !editModal.lignes[0].serviceId) {
      alert("Veuillez choisir au moins une prestation.");
      return;
    }

    try {
      const prixTotal = editModal.lignes.reduce((sum, l) => sum + Number(l.prixFinal || 0), 0);
      const prixBaseTotal = editModal.lignes.reduce((sum, l) => sum + Number(l.prixBase || 0), 0);
      const serviceNoms = editModal.lignes.map(l => l.serviceNom).join(', ');

      const updateData = {
        datePrevue: editModal.datePrevue,
        heurePrevue: editModal.heurePrevue,
        serviceNom: serviceNoms,
        prixBase: prixBaseTotal,
        prixTotal,
        lignes: editModal.lignes,
        statut: editModal.statut || 'non_paye',
      };

      // Supprimer les champs undefined pour éviter un crash Firebase
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(doc(db, 'reservations', editModal.id), updateData);
      setEditModal(null);
    } catch (err) {
      console.error('[Reservations] Erreur lors de la modification:', err);
      alert("Une erreur est survenue lors de la modification de la réservation. Veuillez réessayer.");
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
  const todayISO = activeDate;

  let filteredReservations = reservations;

  if (dateDebutRes || dateFinRes) {
    filteredReservations = filteredReservations.filter(res => {
      const d = res.datePrevue;
      const start = dateDebutRes || '0000-00-00';
      const end = dateFinRes || '9999-99-99';
      return d >= start && d <= end;
    });
  } else {
    filteredReservations = filteredReservations.filter(res => {
      if (activeTab === 'aujourd_hui') return res.datePrevue === todayISO;
      if (activeTab === 'a_venir')    return res.datePrevue > todayISO;
      return res.datePrevue < todayISO;
    });
  }

  if (searchResTerm) {
    const st = searchResTerm.toLowerCase();
    filteredReservations = filteredReservations.filter(res => 
      (res.clientNom || '').toLowerCase().includes(st) ||
      (res.clientTel || '').toLowerCase().includes(st) ||
      (res.employeNom || '').toLowerCase().includes(st) ||
      (res.serviceNom || '').toLowerCase().includes(st)
    );
  }

  // ── Helpers statut ────────────────────────────────────────────────────────
  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredReservations.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

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

    if (statut === 'en_cours') {
      return (
        <span style={{
          padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700',
          backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-color)',
          display: 'inline-flex', alignItems: 'center', gap: '6px'
        }}>
          En cours
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

  // ── Formulaire partagé (liste + modal agenda) ─────────────────────────────
  const renderReservationForm = () => (
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
        
        <div style={{ gridColumn: '1 / -1' }}>
          <PanierPrestations 
            lignes={lignesPanier}
            setLignes={setLignesPanier}
            services={services}
            employes={employes}
            showClientField={false}
          />
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
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="view-container">
        <RechercheExpress reservations={reservations} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-input)', borderRadius: '8px', padding: '4px' }}>
            <button
              onClick={() => setViewMode('liste')}
              className={`nav-btn ${viewMode === 'liste' ? 'active' : ''}`}
              style={{ padding: '6px 15px', fontSize: '0.9rem' }}
            >
              Vue Liste
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`nav-btn ${viewMode === 'agenda' ? 'active' : ''}`}
              style={{ padding: '6px 15px', fontSize: '0.9rem' }}
            >
              Agenda Visuel
            </button>
          </div>
        </div>

        {/* ── FORMULAIRE D'AJOUT (Vue Liste) ─────────────────────────────── */}
        {viewMode === 'liste' && (
          <div className="card">
            <h2 className="card-title">Nouvelle Réservation</h2>
            {renderReservationForm()}
          </div>
        )}

        {/* ── LISTE OU AGENDA ────────────────────────────────────────────── */}
        {viewMode === 'agenda' ? (
          <AgendaVisuel 
            reservations={reservations} 
            onTimeSlotClick={handleTimeSlotClick} 
            onEventClick={setEventDetailsModal} 
            onEventUpdate={handleEventDrop}
          />
        ) : (
          <div className="card">
            <BulkActionBar 
              selectedIds={selectedIds} 
              collectionName="reservations" 
              onClearSelection={() => setSelectedIds([])} 
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <h2 className="card-title" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>Agenda des Rendez-vous</h2>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '15px' }} />
                <input 
                  type="text" 
                  className="input-control" 
                  style={{ paddingLeft: '40px', width: '100%', minHeight: '48px', margin: 0 }}
                  placeholder="Rechercher par client, téléphone, coiffeur..." 
                  value={searchResTerm} 
                  onChange={e => setSearchResTerm(e.target.value)} 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Du</label>
                  <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateDebutRes} onChange={e => setDateDebutRes(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Au</label>
                  <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateFinRes} onChange={e => setDateFinRes(e.target.value)} />
                </div>
              </div>
            </div>

            {(!dateDebutRes && !dateFinRes) && (
              <div style={{ display: 'flex', gap: '5px', backgroundColor: 'var(--bg-input)', padding: '5px', borderRadius: '12px', marginBottom: '15px', width: 'fit-content' }}>
                {[
                  { key: 'aujourd_hui', label: "Aujourd'hui" },
                  { key: 'a_venir',     label: 'À venir' },
                  { key: 'historique',  label: 'Historique' },
                ].map(t => (
                  <button key={t.key}
                    className={`nav-btn ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => { setActiveTab(t.key); setSelectedIds([]); }}
                    style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll}
                      checked={filteredReservations.length > 0 && selectedIds.length === filteredReservations.length}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '10px' }}>Date & Heure</th>
                  <th style={{ padding: '10px' }}>Client</th>
                  <th style={{ padding: '10px' }}>Prestation</th>
                  <th style={{ padding: '10px' }}>Agent(s)</th>
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
                    <tr key={res.id} style={{ 
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: selectedIds.includes(res.id) ? 'rgba(37,99,235,0.05)' : 'transparent'
                    }}>
                      <td style={{ padding: '10px' }}>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(res.id)}
                          onChange={() => handleToggleSelect(res.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '10px', fontWeight: '500' }}>
                        {res.datePrevue} à {res.heurePrevue}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 'bold' }}>{res.clientNom}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.clientTel}</div>
                        {(res.historiqueNotes && res.historiqueNotes.length > 0) && (
                          <button onClick={() => setNotesModal(res)} style={{
                            display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.78rem',
                            color: 'var(--accent-color)', backgroundColor: 'rgba(37,99,235,0.06)',
                            padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(37,99,235,0.12)', cursor: 'pointer'
                          }}>
                            <MessageSquare size={10} style={{ marginTop: '2px', flexShrink: 0 }} />
                            {res.historiqueNotes.length} note(s)
                          </button>
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
                            <FileText size={14} />
                          </button>
                          <button
                            onClick={() => setNotesModal(res)}
                            className="btn btn-small"
                            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                            title="Notes"
                          >
                            <MessageSquare size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(res)}
                            className="btn btn-small"
                            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                            title="Modifier"
                          >
                            <Edit2 size={14} />
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
        )}
      </div>

      {/* ── MODAL AJOUT (Vue Agenda) ──────────────────────────────────────── */}
      {isFormModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '32px',
            width: '100%', maxWidth: '700px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlusCircle size={20} color="var(--accent-color)" /> Nouvelle Réservation
              </h3>
              <button onClick={() => setIsFormModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            {renderReservationForm()}
          </div>
        </div>
      )}

      {/* ── MODAL DÉTAILS ÉVÉNEMENT (Agenda) ──────────────────────────────── */}
      {eventDetailsModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '32px',
            width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Détails de la réservation</h3>
              <button onClick={() => setEventDetailsModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p><strong>Client:</strong> {eventDetailsModal.clientNom} {eventDetailsModal.clientTel ? `(${eventDetailsModal.clientTel})` : ''}</p>
              
              {(() => {
                let agentsStr = eventDetailsModal.employeNom || 'Non assigné';
                let servicesStr = eventDetailsModal.serviceNom || 'Aucune prestation';

                if (eventDetailsModal._isExpanded) {
                  agentsStr = eventDetailsModal._agentNom || eventDetailsModal.employeNom;
                  servicesStr = eventDetailsModal._servicesStr || eventDetailsModal.serviceNom;
                } else if (eventDetailsModal.lignes && eventDetailsModal.lignes.length > 0) {
                  const allAgents = new Set();
                  const allServices = [];
                  eventDetailsModal.lignes.forEach(l => {
                    allServices.push(l.serviceNom);
                    if (l.agents && l.agents.length > 0) {
                      l.agents.forEach(a => allAgents.add(a.nom));
                    }
                  });
                  if (allAgents.size > 0) agentsStr = Array.from(allAgents).join(', ');
                  if (allServices.length > 0) servicesStr = allServices.join(', ');
                }
                const label = agentsStr.includes(',') ? 'Agents:' : 'Agent:';
                
                return (
                  <>
                    <p><strong>Prestation(s):</strong> {servicesStr}</p>
                    <p><strong>{label}</strong> {agentsStr}</p>
                  </>
                );
              })()}

              <p><strong>Horaire:</strong> {eventDetailsModal.datePrevue} à {eventDetailsModal.heurePrevue}</p>
              <p><strong>Statut:</strong> {renderBadge(eventDetailsModal)}</p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => { setFactureModal(eventDetailsModal); setEventDetailsModal(null); }} className="btn btn-small" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', flex: 1 }}>
                <FileText size={16} style={{ marginRight: '4px' }} /> Facture
              </button>
              <button onClick={() => { setNotesModal(eventDetailsModal); setEventDetailsModal(null); }} className="btn btn-small" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', flex: 1 }}>
                <MessageSquare size={16} style={{ marginRight: '4px' }} /> Notes
              </button>
              <button onClick={() => { handleOpenEditModal(eventDetailsModal); setEventDetailsModal(null); }} className="btn btn-small" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', flex: 1 }}>
                <Edit2 size={16} style={{ marginRight: '4px' }} /> Modifier
              </button>
              {isNonEncaisse(eventDetailsModal.statut) && (
                <button onClick={() => { handleEncaisserSolde(eventDetailsModal); setEventDetailsModal(null); }} className="btn btn-success btn-small" style={{ flex: 1 }}>
                  <CreditCard size={16} style={{ marginRight: '4px' }} /> Encaisser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* ── MODAL NOTES ───────────────────────────────────────────────────── */}
      {notesModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '20px',
            width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <MessageSquare size={20} color="var(--accent-color)" /> Notes & Historique
              </h3>
              <button onClick={() => setNotesModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(notesModal.historiqueNotes || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Aucune note pour ce rendez-vous.</p>
              ) : (
                notesModal.historiqueNotes.map((n, i) => (
                  <div key={i} style={{ backgroundColor: 'var(--bg-input)', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(n.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')}
                      </div>
                      <button onClick={() => { setEditingNoteIndex(i); setEditingNoteText(n.texte); }} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }} title="Modifier">
                        <Edit2 size={12} />
                      </button>
                    </div>
                    {editingNoteIndex === i ? (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                        <input type="text" className="input-control" value={editingNoteText} onChange={e => setEditingNoteText(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.9rem', flex: 1 }} />
                        <button onClick={() => handleSaveEditedNote(i)} className="btn btn-primary" style={{ padding: '4px 8px' }}>OK</button>
                        <button onClick={() => setEditingNoteIndex(null)} className="btn" style={{ padding: '4px 8px', background: 'var(--bg-card)', color: 'var(--text-main)' }}><X size={14}/></button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{n.texte}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="input-control"
                placeholder="Ajouter une note..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 15px' }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL EDIT ────────────────────────────────────────────────────── */}
      {editModal && (
        <div 
          onClick={() => setEditModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '32px',
              width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
              maxHeight: '90vh', overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Edit2 size={20} color="var(--accent-color)" /> Modifier le Rendez-vous
              </h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label>Date</label>
                  <input type="date" className="input-control" value={editModal.datePrevue} onChange={e => setEditModal({...editModal, datePrevue: e.target.value})} required />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label>Heure</label>
                  <input type="time" className="input-control" value={editModal.heurePrevue} onChange={e => setEditModal({...editModal, heurePrevue: e.target.value})} required />
                </div>
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <PanierPrestations 
                  lignes={editModal.lignes || []}
                  setLignes={(newLignes) => setEditModal(prev => ({ 
                    ...prev, 
                    lignes: typeof newLignes === 'function' ? newLignes(prev.lignes || []) : newLignes 
                  }))}
                  services={services}
                  employes={employes}
                  showClientField={false}
                  hidePayment={true}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Statut</label>
                <select className="input-control" value={editModal.statut} onChange={e => setEditModal({...editModal, statut: e.target.value})} required>
                  <option value="non_paye">En attente (Non payé)</option>
                  <option value="en_cours">En cours</option>
                  <option value="acompte_verse">Acompte versé</option>
                  <option value="encaisse">Encaissé</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setEditModal(null)} className="btn" style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Enregistrer les modifications
                </button>
              </div>
            </form>
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
