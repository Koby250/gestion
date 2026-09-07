import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Calendar, Clock, User, Scissors,
  CreditCard, CheckCircle, AlertCircle,
  TrendingUp, Wallet, MessageSquare, Filter, AlertTriangle, X, ChevronRight, Award, Star, ChevronDown, ChevronUp
} from 'lucide-react';
import RechercheExpress from './RechercheExpress';
import { computeDetailedGlobalStats } from '../utils/points';

const Accueil = ({ activeDate = new Date().toISOString().substring(0, 10), userRole = '' }) => {
  const [reservations,  setReservations]  = useState([]);
  const [employes,      setEmployes]      = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [chargesFixes,  setChargesFixes]  = useState([]);
  const [inventaire,    setInventaire]    = useState([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Filtres
  const [filterEmploye, setFilterEmploye] = useState('');
  const [filterStatut,  setFilterStatut]  = useState('');
  const [expandedAgents, setExpandedAgents] = useState({});

  const toggleAgentDetails = (agentId) => {
    setExpandedAgents(prev => ({ ...prev, [agentId]: !prev[agentId] }));
  };

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
    const unsubInv = onSnapshot(collection(db, 'inventaire'), snap =>
      setInventaire(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubRes(); unsubEmp(); unsubTx(); unsubCharges(); unsubInv(); };
  }, []);

  // ── Dates ──────────────────────────────────────────────────────────────────
  const activeDateObj = new Date(activeDate);
  const todayISO = activeDate;
  const startOfMonth = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), 1).toISOString();

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

  // ── Ranking KPI (Strictement Hebdomadaire) ─────────────────────────────────
  const getStartAndEndOfWeek = () => {
    const now = new Date(activeDate);
    const dayOfWeek = now.getDay() || 7; // 1 (Mon) - 7 (Sun)
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };
  const { start: weekStart, end: weekEnd } = getStartAndEndOfWeek();
  const weeklyTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= weekStart && d <= weekEnd;
  });

  const detailedStats = computeDetailedGlobalStats(weeklyTx);
  let agentsToRank = employes.filter(e => e.actif !== false && e.categorie === 'Prestataire');

  if (agentsToRank.length === 0) {
    const uniqueMap = {};
    weeklyTx.forEach(t => {
      if (t.type === 'prestation' && t.lignes) {
        t.lignes.forEach(l => {
          if (l.agents) {
            l.agents.forEach(ag => {
              if (ag.id && ag.nom) {
                if (!uniqueMap[ag.id]) uniqueMap[ag.id] = { id: ag.id, nom: ag.nom };
              }
            });
          }
        });
      }
    });
    agentsToRank = Object.values(uniqueMap);
  }

  const allAgentsRanked = agentsToRank.map(e => {
    const dStat = detailedStats[e.id] || { points: 0, services: {} };
    const numUniqueServices = Object.keys(dStat.services).length;
    let polyName = '';
    let polyColor = '';
    if (numUniqueServices >= 3) {
      polyName = 'Polyvalent';
      polyColor = '#8b5cf6';
    }
    const totalServicesCount = Object.values(dStat.services).reduce((a, b) => a + b, 0);
    return {
      id: e.id,
      nom: e.nom,
      points: Math.round((dStat.points || 0) * 10) / 10,
      servicesCount: dStat.services,
      totalServicesCount,
      polyName,
      polyColor
    };
  }).sort((a, b) => b.points - a.points);

  const maxPoints = allAgentsRanked.length > 0 ? Math.max(...allAgentsRanked.map(a => a.points), 1) : 1;

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

  const todayStr = activeDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
        {/* Notes (Historique complet) */}
        {(res.historiqueNotes && res.historiqueNotes.length > 0) && (
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {res.historiqueNotes.map((note, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.82rem',
                backgroundColor: 'rgba(37,99,235,0.06)', padding: '6px 10px', borderRadius: '8px',
                border: '1px solid rgba(37,99,235,0.15)', color: 'var(--text-muted)' }}>
                <MessageSquare size={12} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent-color)' }} />
                <span style={{ fontStyle: 'italic' }}>
                  <strong>{new Date(note.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong> - {note.texte}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Notes (Ancien format fallback) */}
        {(!res.historiqueNotes || res.historiqueNotes.length === 0) && res.notes && (
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

      {/* ── ALERTES STOCK CRITIQUE ────────────────────────── */}
      {inventaire.filter(inv => inv.quantite <= inv.seuilAlerte).length > 0 && (() => {
        const alertItems = inventaire.filter(inv => inv.quantite <= inv.seuilAlerte);
        const topAlerts = alertItems.slice(0, 2);
        
        return (
          <div style={{
            marginBottom: '16px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={16} color="var(--danger)" />
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alertes Stock</span>
              </div>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                {topAlerts.map(inv => (
                  <span key={inv.id} style={{ fontSize: '0.82rem', color: 'var(--text-main)', padding: '2px 8px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontWeight: '600' }}>{inv.nom}</span> : <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{inv.quantite}</span>
                  </span>
                ))}
                {alertItems.length > 2 && (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    + {alertItems.length - 2} autre(s)
                  </span>
                )}
              </div>
            </div>
            
            <button
              onClick={() => setIsAlertModalOpen(true)}
              style={{
                background: 'none', border: 'none', color: 'var(--danger)',
                fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              Voir tout <ChevronRight size={14} />
            </button>
          </div>
        );
      })()}

      {/* ── MODAL LISTE COMPLÈTE ALERTES STOCK ──────────────────────────── */}
      {isAlertModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                <AlertTriangle size={20} color="var(--danger)" /> Articles en rupture
              </h3>
              <button onClick={() => setIsAlertModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px', fontWeight: '600' }}>Article</th>
                    <th style={{ padding: '8px', fontWeight: '600', textAlign: 'center' }}>En stock</th>
                    <th style={{ padding: '8px', fontWeight: '600', textAlign: 'center' }}>Seuil</th>
                  </tr>
                </thead>
                <tbody>
                  {inventaire.filter(inv => inv.quantite <= inv.seuilAlerte).map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: '500', color: 'var(--text-main)' }}>
                        {inv.nom}
                        {inv.categorie && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.categorie}</div>}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--danger)', fontWeight: 'bold' }}>
                        {inv.quantite}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {inv.seuilAlerte}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        </div>
      )}



      {/* ── KPI RAPIDES DU JOUR ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>RDV Aujourd'hui</div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--accent-color)' }}>{rdvJour.length}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {rdvJour.filter(r => r.statut === 'encaisse').length} encaissé(s) · {rdvJour.filter(r => r.statut !== 'encaisse').length} en attente
          </div>
        </div>

        {userRole === 'admin' && (
          <>
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
          </>
        )}
      </div>


      {/* ── WIDGET CLASSEMENT AGENTS ───────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Award size={20} color="var(--accent-color)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>Classement des Prestataires</h2>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Basé sur les points globaux</span>
        </div>
        
        {allAgentsRanked.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Aucun agent prestataire trouvé.</p>
        ) : (
          <>
            {/* PODIUM Top 3 */}
            {allAgentsRanked.length >= 1 && (() => {
              const top3 = allAgentsRanked.slice(0, Math.min(3, allAgentsRanked.length));
              const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] :
                                  top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
              const podiumConfig = [
                { rank: 2, color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.25)', height: '80px', medal: '2' },
                { rank: 1, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)',  height: '110px', medal: '1' },
                { rank: 3, color: '#cd7c3e', bg: 'rgba(205,124,62,0.08)',  border: 'rgba(205,124,62,0.25)', height: '60px',  medal: '3' },
              ];
              const getConfig = (rank) => podiumConfig.find(c => c.rank === rank) || podiumConfig[2];
              return (
                <div className="podium-container">
                  {podiumOrder.map((agent) => {
                    const rank = top3.indexOf(agent) + 1;
                    const cfg = getConfig(rank);
                    const progressToFirst = maxPoints > 0 ? (agent.points / maxPoints) * 100 : 0;
                    return (
                      <div
                        key={agent.id}
                        className={`podium-item rank-${rank}`}
                        style={{
                          background: `linear-gradient(160deg, ${cfg.bg} 0%, var(--bg-card) 100%)`,
                          border: `1px solid ${cfg.border}`,
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                        onClick={() => toggleAgentDetails(agent.id)}
                      >
                        {/* Medaille */}
                        <div style={{
                          width: rank === 1 ? '48px' : '38px',
                          height: rank === 1 ? '48px' : '38px',
                          borderRadius: '50%',
                          backgroundColor: cfg.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '0 auto 10px auto',
                          fontSize: rank === 1 ? '1.4rem' : '1.1rem',
                          fontWeight: '900',
                          color: rank === 1 ? '#1a1200' : '#fff',
                          boxShadow: `0 4px 14px ${cfg.border}`
                        }}>
                          {cfg.medal}
                        </div>

                        <div style={{ fontWeight: '800', fontSize: rank === 1 ? '1rem' : '0.9rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                          {agent.nom}
                        </div>

                        <div style={{ fontSize: rank === 1 ? '1.5rem' : '1.2rem', fontWeight: '900', color: cfg.color, letterSpacing: '-0.03em' }}>
                          {agent.points} pts
                        </div>

                        {agent.totalServicesCount > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: '600' }}>
                            {agent.totalServicesCount} soin{agent.totalServicesCount > 1 ? 's' : ''}
                            {expandedAgents[agent.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </div>
                        )}

                        {expandedAgents[agent.id] && Object.entries(agent.servicesCount || {}).length > 0 && (
                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
                            {Object.entries(agent.servicesCount).map(([sName, sCount]) => (
                              <span key={sName} title={sName} style={{
                                fontSize: '0.65rem', backgroundColor: 'var(--bg-primary)',
                                padding: '2px 5px', borderRadius: '4px', color: 'var(--text-muted)',
                                border: '1px solid var(--border-color)'
                              }}>
                                <strong>{sCount}x</strong> {sName}
                              </span>
                            ))}
                          </div>
                        )}

                        {agent.polyName && (
                          <div style={{ marginTop: '6px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: agent.polyColor, border: `1px solid ${agent.polyColor}`, padding: '1px 7px', borderRadius: '10px' }}>
                              <Star size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                              {agent.polyName}
                            </span>
                          </div>
                        )}

                        {/* Barre de progression vers le #1 */}
                        {rank !== 1 && (
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              {(allAgentsRanked[0].points - agent.points).toFixed(1)} pts pour le 1er
                            </div>
                            <div style={{ height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progressToFirst}%`, backgroundColor: cfg.color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                            </div>
                          </div>
                        )}

                        {/* Piédestal */}
                        <div style={{
                          marginTop: '12px', height: cfg.height, borderRadius: '8px 8px 0 0',
                          backgroundColor: cfg.color, opacity: 0.15, marginLeft: '-12px', marginRight: '-12px', marginBottom: '-16px'
                        }} />
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0, height: cfg.height,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '2.5rem', fontWeight: '900', color: cfg.color, opacity: 0.2
                        }}>
                          {cfg.medal}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Reste du classement */}
            {allAgentsRanked.length > 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Suite du classement</div>
                {allAgentsRanked.slice(3).map((agent, idx) => {
                  const rank = idx + 4;
                  const nextAgent = allAgentsRanked[rank - 2];
                  const ptsToNext = nextAgent ? (nextAgent.points - agent.points).toFixed(1) : 0;
                  const progressPct = maxPoints > 0 ? (agent.points / maxPoints) * 100 : 0;
                  return (
                    <div
                      key={agent.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 16px',
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        transition: 'box-shadow 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                      onClick={() => toggleAgentDetails(agent.id)}
                    >
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-muted)', flexShrink: 0
                      }}>{rank}</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>{agent.nom}</span>
                          {agent.polyName && (
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: agent.polyColor, border: `1px solid ${agent.polyColor}`, padding: '1px 6px', borderRadius: '10px' }}>
                              {agent.polyName}
                            </span>
                          )}
                          {nextAgent && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              -{ptsToNext} pts pour remonter
                            </span>
                          )}
                        </div>
                        <div style={{ height: '5px', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                          <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent-color), #6366f1)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                        </div>
                        {agent.totalServicesCount > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            <span style={{ fontWeight: '600' }}>{agent.totalServicesCount}</span> soin{agent.totalServicesCount > 1 ? 's' : ''} accompli{agent.totalServicesCount > 1 ? 's' : ''}
                            {expandedAgents[agent.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </div>
                        )}
                        {expandedAgents[agent.id] && Object.entries(agent.servicesCount || {}).length > 0 && (
                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                            {Object.entries(agent.servicesCount).map(([sName, sCount]) => (
                              <span key={sName} title={sName} style={{
                                fontSize: '0.65rem', backgroundColor: 'var(--bg-primary)',
                                padding: '2px 5px', borderRadius: '4px', color: 'var(--text-muted)',
                                border: '1px solid var(--border-color)'
                              }}>
                                <strong>{sCount}x</strong> {sName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: 'var(--success)' }}>{agent.points} pts</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
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
