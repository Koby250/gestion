import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Calendar, Clock, User, Scissors,
  CreditCard, CheckCircle, AlertCircle,
  TrendingUp, Wallet, MessageSquare, Filter
} from 'lucide-react';
import RechercheExpress from './RechercheExpress';

const Accueil = () => {
  const [reservations,  setReservations]  = useState([]);
  const [employes,      setEmployes]      = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [chargesFixes,  setChargesFixes]  = useState([]);

  // Filtres
  const [filterEmploye, setFilterEmploye] = useState('');
  const [filterStatut,  setFilterStatut]  = useState('');

  useEffect(() => {
    const unsubRes = onSnapshot(
      query(collection(db, 'reservations'), orderBy('datePrevue', 'asc')),
      snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubEmp = onSnapshot(collection(db, 'employes'), snap =>
      setEmployes(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.actif))
    );
    const unsubTx = onSnapshot(collection(db, 'transactions'), snap =>
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), snap =>
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubRes(); unsubEmp(); unsubTx(); unsubCharges(); };
  }, []);

  // ── Dates ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const todayISO = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // ── Calculs KPIs ───────────────────────────────────────────────────────────
  const todayTx     = transactions.filter(t => t.type === 'prestation' && t.date?.startsWith(todayISO));
  const caJour      = todayTx.reduce((acc, t) => acc + Number(t.montant), 0);

  const monthTx     = transactions.filter(t => t.type === 'prestation' && t.date >= startOfMonth);
  const caMois      = monthTx.reduce((acc, t) => acc + Number(t.montant), 0);

  const totalSalaires    = employes.reduce((acc, e) => acc + (Number(e.salaireFixe) || 0), 0);
  const totalChargesFix  = chargesFixes.filter(c => c.actif).reduce((acc, c) => acc + Number(c.montant), 0);
  const tresorerieNette  = caMois - totalSalaires - totalChargesFix;

  const rdvJour    = reservations.filter(r => r.datePrevue === todayISO);
  const rdvAVenir  = reservations.filter(r => r.datePrevue > todayISO);

  // ── Filtres ────────────────────────────────────────────────────────────────
  const applyFilters = (list) => list.filter(r => {
    if (filterEmploye && r.employeId !== filterEmploye) return false;
    if (filterStatut  && r.statut   !== filterStatut)  return false;
    return true;
  });

  const rdvJourFiltered   = applyFilters(rdvJour);
  const rdvAVenirFiltered = applyFilters(rdvAVenir);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const renderStatutBadge = (res) => {
    const configs = {
      encaisse:       { bg: 'rgba(16,185,129,0.12)',  color: 'var(--success)',      icon: <CheckCircle size={12}/>,  label: 'Encaissé' },
      acompte_verse:  { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B',             icon: <CreditCard  size={12}/>,  label: 'Acompte versé' },
      non_paye:       { bg: 'rgba(239,68,68,0.10)',   color: 'var(--danger)',       icon: <AlertCircle size={12}/>,  label: 'Non encaissé' },
    };
    const cfg = configs[res.statut] || configs.non_paye;
    return (
      <span style={{
        padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700',
        backgroundColor: cfg.bg, color: cfg.color,
        display: 'inline-flex', alignItems: 'center', gap: '4px'
      }}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };

  const todayStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const ReservationCard = ({ res }) => (
    <div style={{
      padding: '14px 16px',
      borderRadius: '12px',
      backgroundColor: 'var(--bg-input)',
      border: '1px solid var(--border-color)',
      display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap'
    }}>
      {/* Heure */}
      <div style={{ minWidth: '60px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--accent-color)' }}>{res.heurePrevue}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {res.datePrevue !== todayISO ? new Date(res.datePrevue).toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) : ''}
        </div>
      </div>

      {/* Infos client */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <User size={14} color="var(--text-muted)" />
          <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{res.clientNom}</span>
          {res.clientTel && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>— {res.clientTel}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <Scissors size={13} />
          <span>{res.serviceNom}</span>
          <span style={{ color: 'var(--accent-color)', fontWeight: '600', marginLeft: '4px' }}>{res.prixTotal?.toLocaleString('fr-FR')} F</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '3px' }}>
          <User size={13} />
          <span>{res.employeNom}</span>
        </div>
        {/* Notes */}
        {res.notes && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginTop: '6px', fontSize: '0.82rem',
            backgroundColor: 'rgba(37,99,235,0.06)', padding: '6px 10px', borderRadius: '8px',
            border: '1px solid rgba(37,99,235,0.15)', color: 'var(--text-muted)' }}>
            <MessageSquare size={12} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent-color)' }} />
            <span style={{ fontStyle: 'italic' }}>{res.notes}</span>
          </div>
        )}
      </div>

      {/* Statut + mode paiement */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        {renderStatutBadge(res)}
        {res.modePaiement && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.modePaiement}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="view-container">
      <RechercheExpress reservations={reservations} />

      {/* ── KPI RAPIDES DU JOUR ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>RDV Aujourd'hui</div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--accent-color)' }}>{rdvJour.length}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {rdvJour.filter(r => r.statut === 'encaisse').length} encaissé(s) · {rdvJour.filter(r => r.statut !== 'encaisse').length} en attente
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>CA du Jour</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--success)' }}>{caJour.toLocaleString('fr-FR')} F</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            <TrendingUp size={13} /> {todayTx.length} transaction(s)
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>CA du Mois</div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-main)' }}>{caMois.toLocaleString('fr-FR')} F</div>
        </div>

        <div className="card" style={{ marginBottom: 0, backgroundColor: tresorerieNette >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${tresorerieNette >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            <Wallet size={13} /> Trésorerie Nette
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', color: tresorerieNette >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {tresorerieNette >= 0 ? '+' : ''}{tresorerieNette.toLocaleString('fr-FR')} F
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            CA − Salaires − Charges Fixes
          </div>
        </div>
      </div>

      {/* ── FILTRES RAPIDES ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="input-control"
            style={{ flex: 1, minWidth: '160px', padding: '6px 10px' }}
            value={filterEmploye}
            onChange={e => setFilterEmploye(e.target.value)}
          >
            <option value="">Tous les coiffeurs</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
          <select
            className="input-control"
            style={{ flex: 1, minWidth: '160px', padding: '6px 10px' }}
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="non_paye">Non encaissé</option>
            <option value="acompte_verse">Acompte versé</option>
            <option value="encaisse">Encaissé</option>
          </select>
          {(filterEmploye || filterStatut) && (
            <button className="btn btn-small" style={{ backgroundColor: 'var(--bg-input)' }} onClick={() => { setFilterEmploye(''); setFilterStatut(''); }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* ── RÉSERVATIONS DU JOUR ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <Calendar size={20} color="var(--accent-color)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
            Réservations du Jour
          </h2>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {todayStr.charAt(0).toUpperCase() + todayStr.slice(1)}
          </span>
        </div>

        {rdvJourFiltered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            <Calendar size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <p>Aucune réservation aujourd'hui.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rdvJourFiltered.map(res => <ReservationCard key={res.id} res={res} />)}
          </div>
        )}
      </div>

      {/* ── RÉSERVATIONS À VENIR ─────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <Clock size={20} color="var(--accent-color)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
            Réservations à Venir
          </h2>
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--accent-color)', fontWeight: '600' }}>
            {rdvAVenir.length} rendez-vous
          </span>
        </div>

        {rdvAVenirFiltered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            <Clock size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <p>Aucun rendez-vous à venir.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rdvAVenirFiltered.map(res => <ReservationCard key={res.id} res={res} />)}
          </div>
        )}
      </div>

    </div>
  );
};

export default Accueil;
