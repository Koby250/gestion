import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  TrendingUp, TrendingDown, Scissors, DollarSign,
  ChevronLeft, ChevronRight, BarChart2, Package
} from 'lucide-react';

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

  // ── Chargement des transactions ──────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, snap =>
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
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

    </div>
  );
};

export default Bilan;
