import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  TrendingUp, TrendingDown, Scissors, DollarSign,
  ChevronLeft, ChevronRight, BarChart2, Package, LineChart, Save, Trash2, Tag
} from 'lucide-react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

// ── Helper : premier et dernier jour d'un mois ────────────────────────────
const getMonthBounds = (year, month) => {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const MOIS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
];

const Bilan = () => {
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based
  const [transactions, setTransactions] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyForm, setHistoryForm] = useState({ month: '', year: now.getFullYear().toString(), ca: '', depenses: '' });
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [employes, setEmployes] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);

  // ── Chargement des transactions et de l'historique ───────────────────────
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap =>
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const unsubHist = onSnapshot(collection(db, 'historique_mensuel'), snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
    });

    const unsubEmp = onSnapshot(collection(db, 'employes'), snap => {
      setEmployes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), snap => {
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsubHist(); unsubEmp(); unsubCharges(); };
  }, []);

  // ── Navigation mois ──────────────────────────────────────────────────────
  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // ── Filtrage par mois ────────────────────────────────────────────────────
  const { start, end } = getMonthBounds(viewYear, viewMonth);

  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });

  const prestations = monthTx.filter(t => t.type === 'prestation');
  const depenses    = monthTx.filter(t => t.type === 'depense');

  const totalCA       = prestations.reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = depenses.reduce((s, t) => s + Number(t.montant), 0);
  const beneficeNet   = totalCA - totalDepenses;
  const nbPrestations = prestations.length;

  const reductions = monthTx.filter(t => t.reductionActive === true);
  const totalReductions = reductions.reduce((s, t) => s + (Number(t.prixOriginal) - Number(t.montant)), 0);

  const totalSalaires     = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const totalChargesFixes = chargesFixes.filter(c => c.actif).reduce((acc, c) => acc + (Number(c.montant) || 0), 0);

  // Trésorerie Nette = CA - Salaires - Charges Fixes
  const tresorerieNette   = totalCA - totalSalaires - totalChargesFixes;
  const tresoreriePositive = tresorerieNette >= 0;

  const pctSalaires     = totalCA > 0 ? Math.min((totalSalaires     / totalCA) * 100, 100) : 0;
  const pctChargesFixes = totalCA > 0 ? Math.min((totalChargesFixes / totalCA) * 100, 100) : 0;
  const pctDepenses     = totalCA > 0 ? Math.min((totalDepenses     / totalCA) * 100, 100) : 0;
  const margeRestante   = Math.max(0, totalCA - totalSalaires - totalChargesFixes - totalDepenses);
  const pctMarge        = totalCA > 0 ? (margeRestante / totalCA) * 100 : 0;

  // ── Analyse par service ──────────────────────────────────────────────────
  const serviceMap = {};
  prestations.forEach(t => {
    const key = t.motif || 'Autre';
    if (!serviceMap[key]) serviceMap[key] = { nom: key, quantite: 0, total: 0, tarif: 0 };
    serviceMap[key].quantite += 1;
    serviceMap[key].total    += Number(t.montant);
    // Tarif unitaire = dernier montant unitaire (approximation)
    serviceMap[key].tarif = Math.round(serviceMap[key].total / serviceMap[key].quantite);
  });
  const serviceList = Object.values(serviceMap).sort((a, b) => b.total - a.total);

  // ── Analyse par catégorie de dépenses ────────────────────────────────────
  const depenseMap = {};
  depenses.forEach(t => {
    const key = t.categorie || 'Non catégorisée';
    if (!depenseMap[key]) depenseMap[key] = { nom: key, total: 0, count: 0 };
    depenseMap[key].total += Number(t.montant);
    depenseMap[key].count += 1;
  });
  const depenseList = Object.values(depenseMap).sort((a, b) => b.total - a.total);

  // ── Formatter ────────────────────────────────────────────────────────────
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);

  // ── Stat Cards config ────────────────────────────────────────────────────
  const statCards = [
    {
      label: "Chiffre d'Affaires",
      value: `${fmt(totalCA)} FCFA`,
      icon: <TrendingUp size={22} />,
      color: 'var(--success)',
      bg: 'rgba(16, 185, 129, 0.08)'
    },
    {
      label: 'Prestations réalisées',
      value: nbPrestations,
      icon: <Scissors size={22} />,
      color: 'var(--accent-color)',
      bg: 'rgba(37, 99, 235, 0.08)'
    },
    {
      label: 'Total Dépenses',
      value: `${fmt(totalDepenses)} FCFA`,
      icon: <TrendingDown size={22} />,
      color: 'var(--danger)',
      bg: 'rgba(239, 68, 68, 0.08)'
    },
    {
      label: 'Bénéfice Net',
      value: `${fmt(beneficeNet)} FCFA`,
      icon: <DollarSign size={22} />,
      color: beneficeNet >= 0 ? 'var(--success)' : 'var(--danger)',
      bg: beneficeNet >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'
    },
  ];

  // ── Handlers Historique ──────────────────────────────────────────────────
  const handleSaveHistory = async (e) => {
    e.preventDefault();
    if (!historyForm.month || !historyForm.year || !historyForm.ca || !historyForm.depenses) return;
    setIsSavingHistory(true);
    
    const docId = `${historyForm.year}-${historyForm.month.padStart(2, '0')}`;
    await setDoc(doc(db, 'historique_mensuel', docId), {
      ca: Number(historyForm.ca),
      depenses: Number(historyForm.depenses),
      benefice: Number(historyForm.ca) - Number(historyForm.depenses)
    });
    
    setHistoryForm({ month: '', year: now.getFullYear().toString(), ca: '', depenses: '' });
    setIsSavingHistory(false);
  };

  const handleDeleteHistory = async (id) => {
    if (window.confirm('Supprimer cet historique ?')) {
      await deleteDoc(doc(db, 'historique_mensuel', id));
    }
  };

  // ── Préparation données pour le Graphique SVG ────────────────────────────
  // On prend l'historique enregistré + le mois en cours calculé (s'il n'est pas déjà dans l'historique)
  const chartData = [...history];
  const currentMonthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (!chartData.find(d => d.id === currentMonthId)) {
    // Calculer le CA du mois en cours depuis les transactions
    const startCurr = new Date(now.getFullYear(), now.getMonth(), 1);
    const endCurr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    let currCa = 0, currDep = 0;
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d >= startCurr && d <= endCurr) {
        if (t.type === 'prestation') currCa += Number(t.montant);
        if (t.type === 'depense') currDep += Number(t.montant);
      }
    });
    chartData.push({
      id: currentMonthId,
      ca: currCa,
      depenses: currDep,
      benefice: currCa - currDep,
      isCurrent: true
    });
  }

  // Calculs pour SVG
  const CHART_WIDTH = 600;
  const CHART_HEIGHT = 200;
  const PADDING = 20;
  
  const maxVal = Math.max(...chartData.map(d => Math.max(d.ca, d.depenses)), 100000); // minimum scale
  
  const getX = (index) => PADDING + (index * ((CHART_WIDTH - 2*PADDING) / Math.max(chartData.length - 1, 1)));
  const getY = (val) => CHART_HEIGHT - PADDING - ((val / maxVal) * (CHART_HEIGHT - 2*PADDING));

  const pathCA = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.ca)}`).join(' ');
  const pathDep = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.depenses)}`).join(' ');
  const pathBen = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.benefice)}`).join(' ');

  return (
    <div className="view-container">

      {/* ── SÉLECTEUR DE MOIS ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button
            onClick={goToPrevMonth}
            className="btn"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', padding: '10px 16px' }}
          >
            <ChevronLeft size={18} />
          </button>

          <div style={{ textAlign: 'center', minWidth: '180px' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)' }}>
              {MOIS_FR[viewMonth]} {viewYear}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {monthTx.length} opération{monthTx.length !== 1 ? 's' : ''} enregistrée{monthTx.length !== 1 ? 's' : ''}
            </div>
          </div>

          <button
            onClick={goToNextMonth}
            className="btn"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', padding: '10px 16px' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── CARTES RÉSUMÉES ───────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {statCards.map((card, i) => (
          <div key={i} className="card" style={{ marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: '800', color: card.color, letterSpacing: '-0.02em' }}>
                  {card.value}
                </div>
              </div>
              <div style={{
                backgroundColor: card.bg, color: card.color,
                padding: '12px', borderRadius: '12px', flexShrink: 0
              }}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── VENTILATION & RÉPARTITION ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h2 className="card-title">Répartition des Recettes — {MOIS_FR[viewMonth]} {viewYear}</h2>

        {/* Grille 3 colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>

          {/* Masse Salariale */}
          <div style={{ backgroundColor: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Masse Salariale — {employes.filter(e => e.actif).length} agents
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalSalaires.toLocaleString('fr-FR')} F</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
              <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalCA > 0 ? Math.round(pctSalaires) : 0}%</span>
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
              <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>{totalCA > 0 ? Math.round(pctChargesFixes) : 0}%</span>
            </div>
            <div style={{ marginTop: '6px', height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
              <div style={{ height: '100%', width: `${Math.min(pctChargesFixes, 100)}%`, backgroundColor: 'var(--danger)', borderRadius: '4px' }} />
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
              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune charge configurée. Voir Paramètres.</div>
            )}
          </div>

          {/* Dépenses variables */}
          <div style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Dépenses Variables</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#F59E0B' }}>{totalDepenses.toLocaleString('fr-FR')} F</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
              <span style={{ fontWeight: 'bold', color: '#F59E0B' }}>{totalCA > 0 ? Math.round(pctDepenses) : 0}%</span>
            </div>
            <div style={{ marginTop: '6px', height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
              <div style={{ height: '100%', width: `${Math.min(pctDepenses, 100)}%`, backgroundColor: '#F59E0B', borderRadius: '4px' }} />
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Achats, fournitures, divers enregistrés en Caisse.</div>
          </div>
        </div>

        {/* Jauge Globale 4 segments */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-color)' }}>Salaires : {Math.round(pctSalaires)}%</span>
            <span style={{ color: 'var(--danger)' }}>Charges Fixes : {Math.round(pctChargesFixes)}%</span>
            <span style={{ color: '#F59E0B' }}>Dépenses variables : {Math.round(pctDepenses)}%</span>
            <span style={{ color: 'var(--success)' }}>Marge nette : {Math.round(pctMarge)}%</span>
          </div>
          <div style={{ width: '100%', height: '14px', display: 'flex', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ width: `${pctSalaires}%`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${pctChargesFixes}%`, backgroundColor: 'var(--danger)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${pctDepenses}%`, backgroundColor: '#F59E0B', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${pctMarge}%`, backgroundColor: 'var(--success)', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Trésorerie Nette du Mois */}
        <div style={{
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: tresoreriePositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${tresoreriePositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Trésorerie Nette du Mois = CA − Salaires − Charges Fixes
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: tresoreriePositive ? 'var(--success)' : 'var(--danger)' }}>
              {tresorerieNette >= 0 ? '+' : ''}{tresorerieNette.toLocaleString('fr-FR')} FCFA
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {fmt(totalCA)} − {fmt(totalSalaires)} − {fmt(totalChargesFixes)} = {tresorerieNette >= 0 ? '+' : ''}{fmt(tresorerieNette)} F
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', color: tresoreriePositive ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
            {tresoreriePositive
              ? `Le CA couvre intégralement les charges fixes et les salaires. Marge disponible : ${fmt(margeRestante)} F.`
              : `Attention : le CA actuel ne couvre pas encore toutes les charges du mois (déficit de ${fmt(Math.abs(tresorerieNette))} F).`
            }
          </div>
        </div>
      </div>

      {/* ── ANALYSE PAR PRESTATION ────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <BarChart2 size={20} color="var(--accent-color)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Analyse par prestation
          </h2>
        </div>

        {serviceList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            Aucune prestation enregistrée pour ce mois.
          </p>
        ) : (
          <>
            {/* VERSION DESKTOP : tableau */}
            <div className="desktop-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '550px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Service</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Qté</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Tarif Unitaire</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Part du CA</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceList.map((s, i) => {
                    const pct = totalCA > 0 ? Math.round((s.total / totalCA) * 100) : 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{s.nom}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: '20px', fontSize: '0.85rem',
                            backgroundColor: 'rgba(37,99,235,0.08)', color: 'var(--accent-color)', fontWeight: '700'
                          }}>
                            {s.quantite}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {fmt(s.tarif)} FCFA
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--success)' }}>
                          {fmt(s.total)} FCFA
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                            <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '10px', minWidth: '60px' }}>
                              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--accent-color)', borderRadius: '10px' }} />
                            </div>
                            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--accent-color)', minWidth: '32px', textAlign: 'right' }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-input)', borderTop: '2px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: '800', color: 'var(--text-main)' }}>TOTAL</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>{nbPrestations}</td>
                    <td></td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--success)', fontSize: '1.05rem' }}>
                      {fmt(totalCA)} FCFA
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text-muted)' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* VERSION MOBILE : cartes empilées */}
            <div className="mobile-cards" style={{ display: 'none' }}>
              {serviceList.map((s, i) => {
                const pct = totalCA > 0 ? Math.round((s.total / totalCA) * 100) : 0;
                return (
                  <div key={i} style={{
                    padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)',
                    marginBottom: '10px', backgroundColor: 'var(--bg-primary)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{s.nom}</span>
                      <span style={{ fontWeight: '800', color: 'var(--success)' }}>{fmt(s.total)} FCFA</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      <span>{s.quantite} prestation{s.quantite > 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{fmt(s.tarif)} FCFA/unité</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '10px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--accent-color)', borderRadius: '10px' }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--accent-color)' }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── ANALYSE DES DÉPENSES ──────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <Package size={20} color="var(--danger)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Dépenses par catégorie
          </h2>
        </div>

        {depenseList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            Aucune dépense enregistrée pour ce mois.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Catégorie</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Opérations</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Total Dépensé</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Part des dépenses</th>
                </tr>
              </thead>
              <tbody>
                {depenseList.map((d, i) => {
                  const pct = totalDepenses > 0 ? Math.round((d.total / totalDepenses) * 100) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{d.nom}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{d.count}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--danger)' }}>
                        {fmt(d.total)} FCFA
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '10px', minWidth: '60px' }}>
                            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--danger)', borderRadius: '10px' }} />
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--danger)', minWidth: '32px', textAlign: 'right' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-input)', borderTop: '2px solid var(--border-color)' }}>
                  <td style={{ padding: '12px', fontWeight: '800', color: 'var(--text-main)' }}>TOTAL</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>
                    {depenses.length}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--danger)', fontSize: '1.05rem' }}>
                    {fmt(totalDepenses)} FCFA
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text-muted)' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── ANALYSE DES RÉDUCTIONS & SERVICES OFFERTS ────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <Tag size={20} color="var(--accent-color)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Réductions & Prestations Offertes
          </h2>
        </div>

        {reductions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            Aucune réduction ou prestation offerte ce mois.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Service / Date</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Agent</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Justificatif</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Type</th>
                  <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Manque à Gagner</th>
                </tr>
              </thead>
              <tbody>
                {reductions.map((r, i) => {
                  const manque = Number(r.prixOriginal) - Number(r.montant);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px', color: 'var(--text-main)' }}>
                        <div style={{ fontWeight: '600' }}>{r.motif}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(r.date).toLocaleDateString('fr-FR')}</div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{r.employeNom}</td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{r.reductionMotif}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {r.reductionType}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--danger)' }}>
                        {fmt(manque)} FCFA
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-input)', borderTop: '2px solid var(--border-color)' }}>
                  <td colSpan="4" style={{ padding: '12px', fontWeight: '800', color: 'var(--text-main)', textAlign: 'right' }}>TOTAL MANQUE À GAGNER</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--danger)', fontSize: '1.05rem' }}>
                    {fmt(totalReductions)} FCFA
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── TENDANCES & HISTORIQUE MULTI-MOIS ──────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <LineChart size={20} color="var(--accent-color)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Évolution & Tendances
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          
          {/* Graphique SVG */}
          <div style={{ flex: 2, minWidth: '350px', overflowX: 'auto', backgroundColor: 'var(--bg-input)', padding: '20px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>Évolution du Chiffre d'Affaires et des Dépenses</h3>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', backgroundColor: 'var(--success)', borderRadius: '3px' }}></div> Chiffre d'Affaires</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', backgroundColor: 'var(--danger)', borderRadius: '3px' }}></div> Dépenses</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '12px', height: '12px', backgroundColor: 'var(--accent-color)', borderRadius: '3px' }}></div> Bénéfice Net</div>
            </div>

            {chartData.length < 2 ? (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Pas assez de données pour afficher un graphique.
              </div>
            ) : (
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                {/* Lignes de repère */}
                {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                  const y = CHART_HEIGHT - PADDING - (ratio * (CHART_HEIGHT - 2*PADDING));
                  return (
                    <g key={ratio}>
                      <line x1={PADDING} y1={y} x2={CHART_WIDTH - PADDING} y2={y} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4 4" />
                      <text x={0} y={y + 4} fontSize="10" fill="var(--text-muted)">{fmt(maxVal * ratio)}</text>
                    </g>
                  );
                })}

                {/* Courbes */}
                <path d={pathCA} fill="none" stroke="var(--success)" strokeWidth="3" />
                <path d={pathDep} fill="none" stroke="var(--danger)" strokeWidth="3" />
                <path d={pathBen} fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeDasharray="4 4" />

                {/* Points & Labels */}
                {chartData.map((d, i) => {
                  const x = getX(i);
                  return (
                    <g key={i}>
                      <circle cx={x} cy={getY(d.ca)} r="4" fill="var(--success)" />
                      <circle cx={x} cy={getY(d.depenses)} r="4" fill="var(--danger)" />
                      <text x={x} y={CHART_HEIGHT} fontSize="10" fill="var(--text-muted)" textAnchor="middle">
                        {d.isCurrent ? 'En cours' : `${d.id.split('-')[1]}/${d.id.split('-')[0].slice(2)}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Formulaire Historique */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>Saisir un mois précédent</h3>
            <form onSubmit={handleSaveHistory} style={{ backgroundColor: 'var(--bg-input)', padding: '15px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Mois (1-12)</label>
                  <input type="number" min="1" max="12" className="input-control" value={historyForm.month} onChange={e => setHistoryForm({...historyForm, month: e.target.value})} required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Année</label>
                  <input type="number" className="input-control" value={historyForm.year} onChange={e => setHistoryForm({...historyForm, year: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label>Chiffre d'Affaires (FCFA)</label>
                <input type="number" className="input-control" value={historyForm.ca} onChange={e => setHistoryForm({...historyForm, ca: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Dépenses (FCFA)</label>
                <input type="number" className="input-control" value={historyForm.depenses} onChange={e => setHistoryForm({...historyForm, depenses: e.target.value})} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSavingHistory}>
                {isSavingHistory ? 'Enregistrement...' : <><Save size={16} /> Enregistrer ce mois</>}
              </button>
            </form>

            {/* Liste des historiques saisis */}
            <div style={{ marginTop: '15px', maxHeight: '150px', overflowY: 'auto' }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: '600' }}>{h.id}</span>
                  <span style={{ color: 'var(--success)' }}>{fmt(h.ca)} F</span>
                  <button onClick={() => handleDeleteHistory(h.id)} className="btn btn-small" style={{ color: 'var(--danger)', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Bilan;
