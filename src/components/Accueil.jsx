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

const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const Accueil = ({ activeDate = localDateStr(), userRole = '' }) => {
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
            {/* PODIUM Top 3 — Design Futuriste Détaillé */}
            {allAgentsRanked.length >= 1 && (() => {
              const top3 = allAgentsRanked.slice(0, Math.min(3, allAgentsRanked.length));

              // SVG décoratifs uniques par rang
              const Rank1Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.18 }} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
                  {/* Rayons solaires depuis le centre haut */}
                  {[0,30,60,90,120,150,180,210,240,270,300,330].map((angle, i) => (
                    <line key={i}
                      x1="150" y1="0"
                      x2={150 + Math.cos((angle - 90) * Math.PI/180) * 300}
                      y2={Math.sin((angle - 90) * Math.PI/180) * 300}
                      stroke="#D4A853" strokeWidth="0.8" strokeDasharray="4 8"
                    />
                  ))}
                  {/* Cercles concentriques */}
                  <circle cx="150" cy="0" r="80" fill="none" stroke="#D4A853" strokeWidth="0.6" />
                  <circle cx="150" cy="0" r="140" fill="none" stroke="#D4A853" strokeWidth="0.4" />
                  {/* Étoiles decoratives */}
                  <text x="20" y="60" fontSize="14" fill="#D4A853">✦</text>
                  <text x="265" y="80" fontSize="10" fill="#D4A853">✦</text>
                  <text x="10" y="300" fontSize="8" fill="#D4A853">◆</text>
                  <text x="275" y="320" fontSize="8" fill="#D4A853">◆</text>
                  {/* Coin haut gauche ornemental */}
                  <path d="M0,0 L40,0 L0,40 Z" fill="#D4A853" opacity="0.15"/>
                  {/* Coin haut droit */}
                  <path d="M300,0 L260,0 L300,40 Z" fill="#D4A853" opacity="0.15"/>
                  {/* Ligne horizontale décorative */}
                  <line x1="30" y1="380" x2="270" y2="380" stroke="#D4A853" strokeWidth="0.6" />
                  <circle cx="150" cy="380" r="3" fill="#D4A853" />
                  <circle cx="30" cy="380" r="2" fill="#D4A853" />
                  <circle cx="270" cy="380" r="2" fill="#D4A853" />
                </svg>
              );

              const Rank2Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.15 }} viewBox="0 0 260 360" preserveAspectRatio="xMidYMid slice">
                  {/* Grille hexagonale */}
                  {[0,1,2,3].map(row => [0,1,2,3].map(col => (
                    <polygon key={`${row}-${col}`}
                      points={`${col*70 + (row%2)*35},${row*60} ${col*70+(row%2)*35+30},${row*60} ${col*70+(row%2)*35+45},${row*60+25} ${col*70+(row%2)*35+30},${row*60+50} ${col*70+(row%2)*35},${row*60+50} ${col*70+(row%2)*35-15},${row*60+25}`}
                      fill="none" stroke="#A8B4C4" strokeWidth="0.5"
                    />
                  )))}
                  {/* Losanges coins */}
                  <path d="M10,10 L25,0 L40,10 L25,20 Z" fill="#A8B4C4" opacity="0.2"/>
                  <path d="M220,10 L235,0 L250,10 L235,20 Z" fill="#A8B4C4" opacity="0.2"/>
                  {/* Tirets latéraux */}
                  <line x1="0" y1="100" x2="15" y2="100" stroke="#A8B4C4" strokeWidth="1.5"/>
                  <line x1="0" y1="110" x2="10" y2="110" stroke="#A8B4C4" strokeWidth="1"/>
                  <line x1="245" y1="100" x2="260" y2="100" stroke="#A8B4C4" strokeWidth="1.5"/>
                  <line x1="250" y1="110" x2="260" y2="110" stroke="#A8B4C4" strokeWidth="1"/>
                  <text x="10" y="350" fontSize="10" fill="#A8B4C4">◈</text>
                  <text x="235" y="350" fontSize="10" fill="#A8B4C4">◈</text>
                </svg>
              );

              const Rank3Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.15 }} viewBox="0 0 260 360" preserveAspectRatio="xMidYMid slice">
                  {/* Diagonales croisées */}
                  <line x1="0" y1="0" x2="260" y2="360" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="6 12"/>
                  <line x1="260" y1="0" x2="0" y2="360" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="6 12"/>
                  {/* Triangles décoratifs coins */}
                  <polygon points="0,0 50,0 0,50" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="260,0 210,0 260,50" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="0,360 50,360 0,310" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="260,360 210,360 260,310" fill="#CD7C3E" opacity="0.12"/>
                  {/* Cercle central décoratif */}
                  <circle cx="130" cy="180" r="80" fill="none" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="4 8"/>
                  <circle cx="130" cy="180" r="50" fill="none" stroke="#CD7C3E" strokeWidth="0.3"/>
                  <text x="15" y="200" fontSize="9" fill="#CD7C3E">▸</text>
                  <text x="240" y="200" fontSize="9" fill="#CD7C3E">◂</text>
                </svg>
              );

              const rankConfig = {
                1: {
                  gradient:    'linear-gradient(160deg, #1A1200 0%, #0F0C00 40%, #0A0A0A 100%)',
                  borderColor: '#6B4E00',
                  glowColor:   'rgba(212,168,83,0.4)',
                  accentColor: '#D4A853',
                  barGradient: 'linear-gradient(90deg, #6B3800, #D4A853, #FFE08A)',
                  medalBg:     'conic-gradient(from 0deg, #6B3800, #D4A853, #FFE08A, #D4A853, #6B3800)',
                  medalText:   '#1A0A00',
                  crownSize:   64,
                  fontSize:    '1.25rem',
                  ptsFontSize: '2rem',
                  ptsLabel:    '✦ CHAMPION ✦',
                  shadowStyle: '0 0 0 1px #6B4E00, 0 0 30px rgba(212,168,83,0.3), 0 16px 48px rgba(0,0,0,0.7)',
                  Decor:       Rank1Decor,
                  padding:     '32px 24px 24px',
                  flex:        '1 1 38%',
                  order:       2,
                },
                2: {
                  gradient:    'linear-gradient(160deg, #0E1218 0%, #080C12 40%, #0A0A0A 100%)',
                  borderColor: '#3A4858',
                  glowColor:   'rgba(168,180,196,0.25)',
                  accentColor: '#A8B4C4',
                  barGradient: 'linear-gradient(90deg, #3A4858, #A8B4C4, #D8E4F4)',
                  medalBg:     'conic-gradient(from 0deg, #3A4858, #A8B4C4, #D8E4F4, #A8B4C4, #3A4858)',
                  medalText:   '#0A0E14',
                  crownSize:   50,
                  fontSize:    '1.05rem',
                  ptsFontSize: '1.5rem',
                  ptsLabel:    '— VICE-CHAMPION —',
                  shadowStyle: '0 0 0 1px #3A4858, 0 0 16px rgba(168,180,196,0.15), 0 12px 36px rgba(0,0,0,0.6)',
                  Decor:       Rank2Decor,
                  padding:     '26px 18px 18px',
                  flex:        '1 1 28%',
                  order:       1,
                },
                3: {
                  gradient:    'linear-gradient(160deg, #180A00 0%, #100600 40%, #0A0A0A 100%)',
                  borderColor: '#6B3A18',
                  glowColor:   'rgba(205,124,62,0.25)',
                  accentColor: '#CD7C3E',
                  barGradient: 'linear-gradient(90deg, #6B3A18, #CD7C3E, #E8A060)',
                  medalBg:     'conic-gradient(from 0deg, #6B3A18, #CD7C3E, #E8A060, #CD7C3E, #6B3A18)',
                  medalText:   '#1A0800',
                  crownSize:   46,
                  fontSize:    '1rem',
                  ptsFontSize: '1.4rem',
                  ptsLabel:    '· TOP 3 ·',
                  shadowStyle: '0 0 0 1px #6B3A18, 0 0 14px rgba(205,124,62,0.18), 0 10px 30px rgba(0,0,0,0.6)',
                  Decor:       Rank3Decor,
                  padding:     '24px 18px 18px',
                  flex:        '1 1 28%',
                  order:       3,
                },
              };

              // DOM: 1er en premier → apparaît en haut sur mobile
              // CSS order: 2e à gauche, 1er au centre, 3e à droite sur desktop
              const displayOrder = top3.length === 3
                ? [top3[0], top3[1], top3[2]]
                : top3.length === 2 ? [top3[0], top3[1]]
                : [top3[0]];

              return (
                <div style={{ display:'flex', gap:'12px', alignItems:'stretch', marginBottom:'24px', flexWrap:'wrap' }}>
                  {displayOrder.map((agent) => {
                    const rank = top3.indexOf(agent) + 1;
                    const cfg = rankConfig[rank] || rankConfig[3];
                    const { Decor } = cfg;
                    const progressPct = maxPoints > 0 ? (agent.points / maxPoints) * 100 : 0;
                    const isFirst = rank === 1;

                    return (
                      <div
                        key={agent.id}
                        onClick={() => toggleAgentDetails(agent.id)}
                        style={{
                          flex: cfg.flex,
                          minWidth: '190px',
                          position: 'relative',
                          borderRadius: '22px',
                          border: `1px solid ${cfg.borderColor}`,
                          background: cfg.gradient,
                          boxShadow: cfg.shadowStyle,
                          padding: cfg.padding,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          order: cfg.order,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-8px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        {/* SVG décoratif unique au rang */}
                        <Decor />

                        {/* Médaille — conic gradient + double ring */}
                        <div style={{ position:'relative', zIndex:2, marginBottom:'14px', marginTop: isFirst ? '10px' : '4px' }}>
                          {/* Ring externe */}
                          <div style={{
                            width: `${cfg.crownSize + 16}px`, height: `${cfg.crownSize + 16}px`,
                            borderRadius:'50%',
                            background: `conic-gradient(from 0deg, transparent 30%, ${cfg.accentColor}55 50%, transparent 70%)`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            animation: isFirst ? 'spin 8s linear infinite' : undefined,
                          }}>
                            {/* Ring interne */}
                            <div style={{
                              width: `${cfg.crownSize + 4}px`, height: `${cfg.crownSize + 4}px`,
                              borderRadius:'50%',
                              background: `rgba(0,0,0,0.6)`,
                              border: `1.5px solid ${cfg.borderColor}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}>
                              {/* Médaille */}
                              <div style={{
                                width: `${cfg.crownSize}px`, height: `${cfg.crownSize}px`,
                                borderRadius:'50%',
                                background: cfg.medalBg,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize: isFirst ? '1.8rem' : rank === 2 ? '1.4rem' : '1.25rem',
                                fontWeight:'900',
                                color: cfg.medalText,
                                boxShadow: `inset 0 2px 4px rgba(255,255,255,0.3), 0 0 20px ${cfg.glowColor}`,
                              }}>
                                {rank === 1 ? '♛' : rank === 2 ? '②' : '③'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Séparateur ornemental sous médaille */}
                        <div style={{
                          display:'flex', alignItems:'center', gap:'6px',
                          marginBottom:'10px', zIndex:2, width:'80%',
                        }}>
                          <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg, transparent, ${cfg.accentColor}60)` }} />
                          <div style={{ width:'5px', height:'5px', borderRadius:'50%', background: cfg.accentColor, boxShadow:`0 0 6px ${cfg.accentColor}` }} />
                          <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg, ${cfg.accentColor}60, transparent)` }} />
                        </div>

                        {/* Nom */}
                        <div style={{
                          fontWeight:'800', fontSize: cfg.fontSize,
                          color:'var(--text-main)', marginBottom:'4px',
                          letterSpacing:'-0.02em', lineHeight:1.2, zIndex:2,
                          textShadow: isFirst ? `0 0 20px ${cfg.glowColor}` : 'none',
                        }}>
                          {agent.nom}
                        </div>

                        {/* Points */}
                        <div style={{
                          fontSize: cfg.ptsFontSize, fontWeight:'900',
                          color: cfg.accentColor, letterSpacing:'-0.04em', lineHeight:1,
                          marginBottom:'12px', zIndex:2,
                          textShadow:`0 0 24px ${cfg.glowColor}, 0 0 48px ${cfg.glowColor}`,
                        }}>
                          {agent.points}
                          <span style={{ fontSize:'0.55em', fontWeight:'700', marginLeft:'4px', opacity:0.75 }}>PTS</span>
                        </div>

                        {/* Stat soins */}
                        <div style={{
                          width:'100%', zIndex:2, marginBottom:'12px',
                        }}>
                          <div style={{
                            background:'rgba(255,255,255,0.03)',
                            border:`1px solid ${cfg.borderColor}`,
                            borderRadius:'10px', padding:'8px 14px',
                            textAlign:'center',
                          }}>
                            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'3px' }}>Soins cette semaine</div>
                            <div style={{ fontSize:'1.2rem', fontWeight:'900', color: cfg.accentColor }}>{agent.totalServicesCount}</div>
                          </div>
                        </div>

                        {/* Badge polyvalent */}
                        {agent.polyName && (
                          <div style={{ marginBottom:'10px', zIndex:2 }}>
                            <span style={{
                              fontSize:'0.62rem', fontWeight:'700',
                              color:'#c084fc',
                              border:'1px solid rgba(192,132,252,0.35)',
                              background:'rgba(192,132,252,0.08)',
                              padding:'3px 10px', borderRadius:'99px',
                              display:'inline-flex', alignItems:'center', gap:'5px',
                              letterSpacing:'0.06em',
                            }}>
                              <Star size={8} /> {agent.polyName}
                            </span>
                          </div>
                        )}

                        {/* Détails soins (toggle) */}
                        {agent.totalServicesCount > 0 && (
                          <div
                            style={{
                              fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:'8px',
                              display:'flex', alignItems:'center', gap:'4px', zIndex:2, cursor:'pointer',
                            }}
                          >
                            <Scissors size={10} />
                            {expandedAgents[agent.id] ? 'Masquer' : 'Voir le détail'}
                            {expandedAgents[agent.id] ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                          </div>
                        )}

                        {expandedAgents[agent.id] && Object.entries(agent.servicesCount || {}).length > 0 && (
                          <div style={{
                            display:'flex', gap:'4px', flexWrap:'wrap', justifyContent:'center',
                            marginBottom:'10px', zIndex:2,
                          }}>
                            {Object.entries(agent.servicesCount).map(([sName, sCount]) => (
                              <span key={sName} style={{
                                fontSize:'0.62rem',
                                background:`rgba(255,255,255,0.03)`,
                                border:`1px solid ${cfg.borderColor}`,
                                padding:'2px 8px', borderRadius:'6px',
                                color: cfg.accentColor, fontWeight:'600',
                              }}>
                                {sCount}× {sName}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Barre de progression vers le 1er */}
                        <div style={{ width:'100%', zIndex:2 }}>
                          <div style={{
                            display:'flex', justifyContent:'space-between',
                            fontSize:'0.62rem', color:'var(--text-muted)',
                            marginBottom:'5px',
                          }}>
                            <span>{rank === 1 ? '🏆 Leader' : `${(allAgentsRanked[0].points - agent.points).toFixed(1)} pts pour le 1er`}</span>
                            <span style={{ color: cfg.accentColor, fontWeight:700 }}>{Math.round(progressPct)}%</span>
                          </div>
                          <div style={{
                            height:'6px', borderRadius:'99px',
                            background:'rgba(255,255,255,0.05)',
                            overflow:'hidden', position:'relative',
                          }}>
                            <div style={{
                              height:'100%', width:`${progressPct}%`,
                              background: cfg.barGradient,
                              borderRadius:'99px',
                              transition:'width 1s cubic-bezier(0.34,1.56,0.64,1)',
                              boxShadow:`0 0 10px ${cfg.glowColor}`,
                            }} />
                          </div>
                        </div>

                        {/* Ligne décorative bas de carte */}
                        <div style={{
                          position:'absolute', bottom:0, left:0, right:0, height:'2px',
                          background: cfg.barGradient,
                          opacity: isFirst ? 1 : 0.55,
                        }} />

                        {/* Coins décoratifs internes */}
                        <div style={{
                          position:'absolute', bottom:'12px', left:'12px',
                          width:'10px', height:'10px',
                          borderLeft:`1px solid ${cfg.accentColor}50`,
                          borderBottom:`1px solid ${cfg.accentColor}50`,
                          borderRadius:'0 0 0 4px',
                        }} />
                        <div style={{
                          position:'absolute', bottom:'12px', right:'12px',
                          width:'10px', height:'10px',
                          borderRight:`1px solid ${cfg.accentColor}50`,
                          borderBottom:`1px solid ${cfg.accentColor}50`,
                          borderRadius:'0 0 4px 0',
                        }} />
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
