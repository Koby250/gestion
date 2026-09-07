import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import {
  TrendingUp, TrendingDown, Scissors, DollarSign,
  ChevronLeft, ChevronRight, BarChart2, Package, LineChart, Save, Trash2, Tag,  User, Percent, Receipt, Gift, Award, Star, Activity, ChevronDown, ChevronUp
} from 'lucide-react';
import { computeGlobalPoints, computeDetailedGlobalStats } from '../utils/points';
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
  const [expandedService, setExpandedService] = useState(null);
  const [trendGranularity, setTrendGranularity] = useState('mensuel');
  const [rankServiceFilter, setRankServiceFilter] = useState('Tous');
  const [rankPeriodFilter, setRankPeriodFilter] = useState('mensuel');
  const [expandedAgents, setExpandedAgents] = useState({});

  const [avances, setAvances] = useState([]);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [showSalariesClosureModal, setShowSalariesClosureModal] = useState(false);
  const [isClosingSalaries, setIsClosingSalaries] = useState(false);
  const [salaryClosureMode, setSalaryClosureMode] = useState('global');
  const [individualSalariesForm, setIndividualSalariesForm] = useState({});

  const toggleAgentDetails = (agentId) => {
    setExpandedAgents(prev => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  const handleClosure = async () => {
    setIsClosing(true);
    try {
      const moisLabel = `${MOIS_FR[viewMonth]} ${viewYear}`;
      const now = new Date().toISOString();
      const activeCharges = chargesFixes.filter(c => c.actif);

      for (const c of activeCharges) {
        const realise = depenses
          .filter(t => t.categorie === c.nom)
          .reduce((s, t) => s + Number(t.montant), 0);
        const budget = Number(c.montant) || 0;
        const ecart = budget - realise;

        if (ecart === 0) continue;

        if (ecart > 0) {
          await addDoc(collection(db, 'transactions'), {
            type: 'prestation',
            montant: ecart,
            motif: `Reliquat ${c.nom} — Cloture ${moisLabel}`,
            categorie: c.nom,
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        } else {
          await addDoc(collection(db, 'transactions'), {
            type: 'depense',
            montant: Math.abs(ecart),
            motif: `Combler deficit ${c.nom} — Cloture ${moisLabel}`,
            categorie: c.nom,
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        }
      }

      setShowClosureModal(false);
      alert(`Cloture des charges (${moisLabel}) effectuee avec succes.`);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la cloture des charges.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleClosureSalaries = async () => {
    setIsClosingSalaries(true);
    try {
      const moisLabel = `${MOIS_FR[viewMonth]} ${viewYear}`;
      const now = new Date().toISOString();
      const activeEmployes = employes.filter(e => e.actif);

      for (const emp of activeEmployes) {
        const empAvances = monthAvances
          .filter(a => a.employeId === emp.id)
          .reduce((sum, a) => sum + Number(a.montant), 0);
        const salaireFixe = Number(emp.salaireFixe) || 0;
        let aVerser = 0;

        if (salaryClosureMode === 'global') {
          aVerser = Math.max(0, salaireFixe - empAvances);
        } else {
          aVerser = Number(individualSalariesForm[emp.id]) || 0;
        }

        if (aVerser > 0) {
          await addDoc(collection(db, 'transactions'), {
            type: 'depense',
            montant: aVerser,
            motif: `Cloture Salaire - ${emp.nom} (${moisLabel})`,
            categorie: 'Paiement Salaires',
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        }
      }

      setShowSalariesClosureModal(false);
      alert(`Cloture des salaires (${moisLabel}) effectuee avec succes.`);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la cloture des salaires.');
    } finally {
      setIsClosingSalaries(false);
    }
  };

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

  const monthAvances = (avances || []).filter(a => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });

  const prestations = monthTx.filter(t => t.type === 'prestation');
  const depenses    = monthTx.filter(t => t.type === 'depense');

  const totalCA       = prestations.reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = depenses.reduce((s, t) => s + Number(t.montant), 0);
  const beneficeNet   = totalCA - totalDepenses;
  const nbPrestations = prestations.length;

  const oldReductions = monthTx.filter(t => t.reductionActive === true);
  let totalReductions = oldReductions.reduce((s, t) => s + (Number(t.prixOriginal) - Number(t.montant)), 0);

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

  // ── Top 3 Agents du Mois ─────────────────────────────────────────────────
  const agentStats = {};
  monthTx.forEach(t => {
    if (t.type === 'prestation') {
      if (t.lignes && t.lignes.length > 0) {
        t.lignes.forEach(ligne => {
          (ligne.agents || []).forEach(agent => {
            if (!agentStats[agent.id]) agentStats[agent.id] = { nom: agent.nom, count: 0, ca: 0 };
            agentStats[agent.id].count += 1;
            // Repartition CA per agent logic: dividing line price by number of agents
            const basePrice = ligne.prixFinal !== undefined ? Number(ligne.prixFinal) : Number(ligne.prix);
            const caPerAgent = basePrice / (ligne.agents.length || 1);
            agentStats[agent.id].ca += caPerAgent;
          });
        });
      } else if (t.employeId) {
        if (!agentStats[t.employeId]) agentStats[t.employeId] = { nom: t.employeNom || 'Inconnu', count: 0, ca: 0 };
        agentStats[t.employeId].count += 1;
        agentStats[t.employeId].ca += Number(t.montant);
      }
    }
  });
  
  const globalPoints = computeGlobalPoints(transactions);
  const detailedStats = computeDetailedGlobalStats(transactions);
  
  let agentsToRank = employes.filter(e => e.actif !== false && e.categorie === 'Prestataire');

  // Fallback 1: Extraction depuis les transactions et les statistiques existantes
  if (agentsToRank.length === 0) {
    const uniqueMap = {};
    Object.keys(detailedStats).forEach(id => {
      if (id && id !== 'undefined' && id !== 'null') {
        uniqueMap[id] = { id, nom: 'Agent ' + id.substring(0, 4) };
      }
    });
    Object.keys(agentStats).forEach(id => {
      if (id && id !== 'undefined' && id !== 'null') {
        if (!uniqueMap[id]) uniqueMap[id] = { id, nom: agentStats[id].nom || 'Agent ' + id.substring(0, 4) };
        else if (agentStats[id].nom) uniqueMap[id].nom = agentStats[id].nom;
      }
    });
    
    transactions.forEach(t => {
      if (t.type === 'prestation' && t.lignes) {
        t.lignes.forEach(l => {
          if (l.agents) {
            l.agents.forEach(ag => {
              if (ag.id && ag.nom) {
                if (!uniqueMap[ag.id]) uniqueMap[ag.id] = { id: ag.id, nom: ag.nom };
                else uniqueMap[ag.id].nom = ag.nom;
              }
            });
          }
        });
      }
    });
    
    agentsToRank = Object.values(uniqueMap);
  }
  
  // Fallback 2: Liste par défaut si la base est complètement vide
  if (agentsToRank.length === 0) {
    agentsToRank = [
      { id: 'default-1', nom: 'Coiffeur Principal' },
      { id: 'default-2', nom: 'Esthéticien(ne)' },
      { id: 'default-3', nom: 'Barbier' }
    ];
  }

  const allAgentsRanked = agentsToRank.map(e => {
      const stat = agentStats[e.id] || { count: 0, ca: 0 };
      const dStat = detailedStats[e.id] || { points: 0, services: {} };
      
      const numUniqueServices = Object.keys(dStat.services).length;
      
      let polyName = '';
      let polyColor = '';
      if (numUniqueServices >= 3) {
        polyName = 'Polyvalent';
        polyColor = '#8b5cf6'; // purple
      }

      return {
        id: e.id,
        nom: e.nom,
        count: stat.count,
        ca: stat.ca,
        points: dStat.points || 0,
        servicesCount: dStat.services,
        polyName,
        polyColor
      };
    })
    .sort((a, b) => b.points - a.points);

  // ── Périodes pour le classement (Journalier, Hebdomadaire, Mensuel) ────────
  const getDailyBounds = () => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    return { s, e };
  };
  const getWeeklyBounds = () => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const s = new Date(now);
    s.setDate(now.getDate() - dayOfWeek + 1);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return { s, e };
  };

  // Transactions filtrées par période pour le classement
  const rankTxSource = (() => {
    if (rankPeriodFilter === 'mensuel') return monthTx;
    if (rankPeriodFilter === 'hebdomadaire') {
      const { s, e } = getWeeklyBounds();
      return transactions.filter(t => { const d = new Date(t.date); return d >= s && d <= e; });
    }
    if (rankPeriodFilter === 'journalier') {
      const { s, e } = getDailyBounds();
      return transactions.filter(t => { const d = new Date(t.date); return d >= s && d <= e; });
    }
    return monthTx;
  })();

  const rankDetailedStats = computeDetailedGlobalStats(rankTxSource);

  // Points filtrés par service pour le classement
  const computeFilteredPoints = (txList, serviceFilter) => {
    const map = {};
    txList.forEach(t => {
      if (t.type !== 'prestation' || !t.lignes) return;
      t.lignes.forEach(l => {
        if (serviceFilter !== 'Tous') {
          const name = (l.serviceNom || '').toLowerCase();
          const filter = serviceFilter.toLowerCase();
          if (!name.includes(filter)) return;
        }
        const agents = l.agents || [];
        const numAgents = agents.length || 1;
        agents.forEach(ag => {
          if (!ag.id) return;
          if (!map[ag.id]) map[ag.id] = { points: 0, services: {} };
          const sname = (l.serviceNom || '').toLowerCase();
          let pts = 0;
          if (sname.includes('gommage') || sname.includes('manucure')) pts = 1;
          else if (sname.includes('coiffure') || sname.includes('coupe') || sname.includes('barbe')) pts = 2;
          else if (sname.includes('visage standard')) pts = 3;
          else if (sname.includes('visage premium')) pts = 4;
          else if (sname.includes('p\u00e9dicure') || sname.includes('pedicure')) pts = 5;
          else if (sname.includes('visage')) pts = 3;
          map[ag.id].points += pts / numAgents;
          const sn = l.serviceNom || 'Autre';
          map[ag.id].services[sn] = (map[ag.id].services[sn] || 0) + 1;
        });
      });
    });
    return map;
  };

  const SERVICE_FILTERS = ['Tous', 'Coiffure', 'Barbe', 'P\u00e9dicure', 'Manucure', 'Visage', 'Gommage'];

  const filteredRankStats = computeFilteredPoints(rankTxSource, rankServiceFilter);

  const allAgentsRankedFiltered = agentsToRank.map(e => {
    const stat = agentStats[e.id] || { count: 0, ca: 0 };
    const fStat = filteredRankStats[e.id] || { points: 0, services: {} };
    const numUniqueServices = Object.keys(fStat.services).length;
    const totalServicesCount = Object.values(fStat.services).reduce((a, b) => a + b, 0);
    return {
      id: e.id,
      nom: e.nom,
      count: stat.count,
      ca: stat.ca,
      points: Math.round(fStat.points * 10) / 10,
      servicesCount: fStat.services,
      totalServicesCount,
      polyvalent: numUniqueServices >= 3
    };
  }).sort((a, b) => b.points - a.points);

  const maxPoints = allAgentsRankedFiltered.length > 0 ? Math.max(...allAgentsRankedFiltered.map(a => a.points), 1) : 1;

  // ── Suivi des réductions ──────────────────────────────────────────────────
  const reductionsList = [];
  
  oldReductions.forEach(t => {
    reductionsList.push({
      date: t.date,
      client: t.clientNom || 'Client anonyme',
      service: t.motif || 'Prestation (ancien format)',
      agents: t.employeNom || 'Inconnu',
      montant: (Number(t.prixOriginal) - Number(t.montant)) || 0,
      motif: t.reductionMotif || 'Aucun motif',
      type: t.reductionType || 'percent'
    });
  });
  
  prestations.forEach(t => {
    if (t.lignes && t.lignes.length > 0) {
      t.lignes.forEach(ligne => {
        if (ligne.remiseType && ligne.remiseType !== 'aucune') {
          const prixBase = Number(ligne.prixBase) || 0;
          const prixFinal = Number(ligne.prixFinal) || 0;
          const montantRemise = prixBase - prixFinal;
          if (montantRemise > 0 || ligne.remiseType === 'offert') {
            if (montantRemise > 0) {
              totalReductions += montantRemise;
            }
            reductionsList.push({
              date: t.date,
              client: t.clientNom || 'Client anonyme',
              service: ligne.serviceNom,
              agents: (ligne.agents || []).map(a => a.nom).join(', ') || t.employeNom || '-',
              montant: montantRemise,
              motif: ligne.remiseMotif || (ligne.remiseType === 'offert' ? 'Soin Offert' : 'Aucun motif'),
              type: ligne.remiseType
            });
          }
        }
      });
    }
  });

  // Sort reductions by date descending
  reductionsList.sort((a, b) => new Date(b.date) - new Date(a.date));

  // ── Analyse par service (lignes individuelles) ───────────────────────────
  const serviceMap = {};
  prestations.forEach(t => {
    if (t.lignes && t.lignes.length > 0) {
      // Multi-service transaction: iterate each line
      t.lignes.forEach(ligne => {
        const key = ligne.serviceNom || 'Autre';
        if (!serviceMap[key]) serviceMap[key] = { nom: key, quantite: 0, total: 0, tarif: 0, details: [] };
        serviceMap[key].quantite += 1;
        serviceMap[key].total += Number(ligne.prixFinal) || 0;
        serviceMap[key].tarif = Math.round(serviceMap[key].total / serviceMap[key].quantite);
        serviceMap[key].details.push({
          date: t.date,
          client: t.clientNom || 'Client anonyme',
          agents: (ligne.agents || []).map(a => a.nom).join(', ') || t.employeNom || '-',
          montant: Number(ligne.prixFinal) || 0,
          mode: t.modePaiement || '-',
          saisieParNom: t.saisieParNom || ''
        });
      });
    } else {
      // Legacy single-service transaction
      const key = t.motif || 'Autre';
      if (!serviceMap[key]) serviceMap[key] = { nom: key, quantite: 0, total: 0, tarif: 0, details: [] };
      serviceMap[key].quantite += 1;
      serviceMap[key].total += Number(t.montant);
      serviceMap[key].tarif = Math.round(serviceMap[key].total / serviceMap[key].quantite);
      serviceMap[key].details.push({
        date: t.date,
        client: t.clientNom || 'Client anonyme',
        agents: t.employeNom || '-',
        montant: Number(t.montant),
        mode: t.modePaiement || '-',
        saisieParNom: t.saisieParNom || ''
      });
    }
  });
  const serviceList = Object.values(serviceMap).sort((a, b) => b.total - a.total);
  const totalLignes = serviceList.reduce((s, sv) => s + sv.quantite, 0);

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
    {
      label: 'Réductions Accordées',
      value: `${fmt(totalReductions)} FCFA`,
      icon: <Percent size={22} />,
      color: 'var(--warning)',
      bg: 'rgba(245, 158, 11, 0.08)'
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
  let chartData = [];
  
  if (trendGranularity === 'mensuel') {
    chartData = [...history];
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
        label: `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(2)}`,
        ca: currCa,
        depenses: currDep,
        benefice: currCa - currDep,
        isCurrent: true
      });
    }
    chartData.forEach(d => {
      if (!d.label) d.label = `${d.id.split('-')[1]}/${d.id.split('-')[0].slice(2)}`;
    });
  } else if (trendGranularity === 'journalier') {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const dayMap = {};
    for (let i = 1; i <= daysInMonth; i++) {
       dayMap[i] = { id: `Jour ${i}`, label: `${i}`, ca: 0, depenses: 0, benefice: 0 };
    }
    transactions.forEach(t => {
       const d = new Date(t.date);
       if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
          const day = d.getDate();
          if (t.type === 'prestation') dayMap[day].ca += Number(t.montant);
          if (t.type === 'depense') dayMap[day].depenses += Number(t.montant);
       }
    });
    chartData = Object.values(dayMap).map(d => ({...d, benefice: d.ca - d.depenses}));
  } else if (trendGranularity === 'hebdomadaire') {
    const weekMap = {};
    for (let i = 1; i <= 5; i++) {
       weekMap[i] = { id: `Semaine ${i}`, label: `S${i}`, ca: 0, depenses: 0, benefice: 0 };
    }
    transactions.forEach(t => {
       const d = new Date(t.date);
       if (d.getMonth() === viewMonth && d.getFullYear() === viewYear) {
          const day = d.getDate();
          const week = Math.ceil(day / 7);
          const w = week > 5 ? 5 : week;
          if (t.type === 'prestation') weekMap[w].ca += Number(t.montant);
          if (t.type === 'depense') weekMap[w].depenses += Number(t.montant);
       }
    });
    chartData = Object.values(weekMap).map(d => ({...d, benefice: d.ca - d.depenses}));
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

      {/* ── CLASSEMENT DES AGENTS ────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px 24px' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <Award size={20} color="var(--accent-color)" />
          <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)' }}>Performances &amp; Classement des Agents</span>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Type de prestation</label>
            <select
              className="input-control"
              style={{ width: '100%', margin: 0 }}
              value={rankServiceFilter}
              onChange={e => setRankServiceFilter(e.target.value)}
            >
              {SERVICE_FILTERS.map(f => <option key={f} value={f}>{f === 'Tous' ? 'Toutes les prestations' : f}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Période</label>
            <select
              className="input-control"
              style={{ width: '100%', margin: 0 }}
              value={rankPeriodFilter}
              onChange={e => setRankPeriodFilter(e.target.value)}
            >
              <option value="journalier">Journalier (Aujourd'hui)</option>
              <option value="hebdomadaire">Hebdomadaire (Cette semaine)</option>
              <option value="mensuel">Mensuel ({MOIS_FR[viewMonth]} {viewYear})</option>
            </select>
          </div>
        </div>

        {allAgentsRankedFiltered.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Aucun résultat pour cette période et ce filtre.</p>
        ) : (
          <>
            {/* PODIUM Top 3 */}
            {allAgentsRankedFiltered.length >= 1 && (() => {
              const top3 = allAgentsRankedFiltered.slice(0, Math.min(3, allAgentsRankedFiltered.length));
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
                  {podiumOrder.map((agent, pIdx) => {
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

                        {agent.polyvalent && (
                          <div style={{ marginTop: '6px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#8b5cf6', border: '1px solid #8b5cf6', padding: '1px 7px', borderRadius: '10px' }}>
                              <Star size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                              Polyvalent
                            </span>
                          </div>
                        )}

                        {/* Barre de progression vers le #1 */}
                        {rank !== 1 && (
                          <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                              {(allAgentsRankedFiltered[0].points - agent.points).toFixed(1)} pts pour le 1er
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
            {allAgentsRankedFiltered.length > 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Suite du classement</div>
                {allAgentsRankedFiltered.slice(3).map((agent, idx) => {
                  const rank = idx + 4;
                  const nextAgent = allAgentsRankedFiltered[rank - 2];
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
                          {agent.polyvalent && (
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#8b5cf6', border: '1px solid #8b5cf6', padding: '1px 6px', borderRadius: '10px' }}>
                              Polyvalent
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
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{Math.round(agent.ca).toLocaleString('fr-FR')} F CA</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
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

            {(() => {
              const totalVersé = employes.filter(e => e.actif).reduce((s, emp) => {
                return s + monthAvances.filter(a => a.employeId === emp.id).reduce((x, a) => x + Number(a.montant), 0);
              }, 0);
              const pctVerse = totalSalaires > 0 ? Math.min((totalVersé / totalSalaires) * 100, 100) : 0;
              const completed = totalVersé >= totalSalaires;

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                      {totalVersé.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>/ {totalSalaires.toLocaleString('fr-FR')} F (total)</div>
                  </div>
                  
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: `${pctVerse}%`, backgroundColor: completed ? 'var(--success)' : 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Part du CA global</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalCA > 0 ? Math.round(pctSalaires) : 0}%</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: completed ? 'var(--success)' : 'var(--text-main)', marginBottom: '8px' }}>
                    {completed ? 'Salaires entierement verses' : `Reste a verser : ${(totalSalaires - totalVersé).toLocaleString('fr-FR')} F`}
                  </div>
                </>
              );
            })()}

            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(37,99,235,0.15)', paddingTop: '10px' }}>
              {employes.filter(e => e.actif).map(e => {
                const verse = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                const base = Number(e.salaireFixe) || 0;
                const reste = Math.max(0, base - verse);
                return (
                  <div key={e.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(37,99,235,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{e.nom}</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {verse.toLocaleString('fr-FR')} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ {base.toLocaleString('fr-FR')} F</span>
                      </span>
                    </div>
                    {reste > 0 ? (
                      <div style={{ fontSize: '0.72rem', color: '#F59E0B' }}>Reste : {reste.toLocaleString('fr-FR')} F</div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>Solde</div>
                    )}
                  </div>
                );
              })}
            </div>

            {employes.filter(e => e.actif).length > 0 && (
              <button
                onClick={() => {
                  const initForm = {};
                  employes.filter(e => e.actif).forEach(e => {
                    const verse = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                    const reste = Math.max(0, (Number(e.salaireFixe) || 0) - verse);
                    initForm[e.id] = reste;
                  });
                  setIndividualSalariesForm(initForm);
                  setSalaryClosureMode('global');
                  setShowSalariesClosureModal(true);
                }}
                className="btn"
                style={{ marginTop: '14px', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
              >
                Cloturer les salaires
              </button>
            )}
          </div>

          {/* Charges Fixes — Suivi temps réel */}
          <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Charges Fixes Mensuelles</div>

            {(() => {
              const totalRealise = chargesFixes.filter(c => c.actif).reduce((s, c) => {
                return s + depenses.filter(t => t.categorie === c.nom).reduce((x, t) => x + Number(t.montant), 0);
              }, 0);
              const totalBudget = totalChargesFixes;
              const ecart = totalBudget - totalRealise;
              const pctGlobal = totalBudget > 0 ? Math.min((totalRealise / totalBudget) * 100, 100) : 0;
              const overAll = totalRealise > totalBudget;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: overAll ? 'var(--danger)' : 'var(--text-main)' }}>
                      {totalRealise.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>/ {totalBudget.toLocaleString('fr-FR')} F alloués</div>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: `${pctGlobal}%`, backgroundColor: overAll ? 'var(--danger)' : pctGlobal > 75 ? '#F59E0B' : 'var(--success)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>{totalCA > 0 ? Math.round(pctChargesFixes) : 0}%</span>
                  </div>
                  {ecart !== 0 && (
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: ecart > 0 ? 'var(--success)' : 'var(--danger)', marginBottom: '6px' }}>
                      {ecart > 0
                        ? `Reliquat disponible : +${ecart.toLocaleString('fr-FR')} F`
                        : `Déficit global : ${ecart.toLocaleString('fr-FR')} F`}
                    </div>
                  )}
                </>
              );
            })()}

            {chargesFixes.filter(c => c.actif).length > 0 ? (
              <div style={{ marginTop: '12px', borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: '10px' }}>
                {chargesFixes.filter(c => c.actif).map(c => {
                  const depensesCharge = depenses.filter(t => t.categorie === c.nom);
                  const realise = depensesCharge.reduce((s, t) => s + Number(t.montant), 0);
                  const budget = Number(c.montant) || 0;
                  const pct = budget > 0 ? Math.min((realise / budget) * 100, 100) : 0;
                  const overBudget = realise > budget;
                  const barColor = overBudget ? 'var(--danger)' : pct > 75 ? '#F59E0B' : 'var(--success)';
                  return (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{c.nom}</span>
                        <span style={{ fontWeight: '600', color: overBudget ? 'var(--danger)' : 'var(--text-main)' }}>
                          {realise.toLocaleString('fr-FR')} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ {budget.toLocaleString('fr-FR')} F</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                      {overBudget && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px' }}>
                          Depassement de {(realise - budget).toLocaleString('fr-FR')} F
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune charge configurée. Voir Paramètres.</div>
            )}

            {chargesFixes.filter(c => c.actif).length > 0 && (
              <button
                onClick={() => setShowClosureModal(true)}
                className="btn"
                style={{ marginTop: '14px', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
              >
                Cloturer les charges fixes
              </button>
            )}
          </div>

          {/* Seuil de Rentabilité & Marge Nette */}
          <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Seuil de Rentabilité & Marge
            </div>
            {(() => {
              const seuilRentabilite = totalSalaires + totalChargesFixes;
              const caPct = seuilRentabilite > 0 ? Math.min((totalCA / seuilRentabilite) * 100, 100) : 100;
              const seuilAtteint = totalCA >= seuilRentabilite;
              
              const totalD = depenses.reduce((s, t) => s + Number(t.montant), 0);
              const margeNette = totalCA - totalSalaires - totalD;
              const margePct = totalCA > 0 ? (margeNette / totalCA) * 100 : 0;

              return (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Point Mort</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{seuilRentabilite.toLocaleString('fr-FR')} F</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CA Actuel</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: seuilAtteint ? 'var(--success)' : '#F59E0B' }}>{totalCA.toLocaleString('fr-FR')} F</div>
                      </div>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '4px' }}>
                      <div style={{ height: '100%', width: `${caPct}%`, backgroundColor: seuilAtteint ? 'var(--success)' : '#F59E0B', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '600', color: seuilAtteint ? 'var(--success)' : '#F59E0B', textAlign: 'center' }}>
                      {seuilAtteint ? `Seuil dépassé de ${(totalCA - seuilRentabilite).toLocaleString('fr-FR')} F` : `Manque ${(seuilRentabilite - totalCA).toLocaleString('fr-FR')} F pour atteindre le seuil`}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Marge Nette Opérationnelle</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: '800', color: margeNette >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {margePct.toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '0.85rem', color: margeNette >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                        ({margeNette >= 0 ? '+' : ''}{margeNette.toLocaleString('fr-FR')} F)
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Jauge Globale 3 segments */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-color)' }}>Salaires : {totalCA > 0 ? Math.round((totalSalaires / totalCA) * 100) : 0}%</span>
            <span style={{ color: 'var(--danger)' }}>Charges Fixes : {totalCA > 0 ? Math.round((totalChargesFixes / totalCA) * 100) : 0}%</span>
            <span style={{ color: 'var(--success)' }}>Marge nette : {totalCA > 0 ? Math.round(((totalCA - totalSalaires - depenses.reduce((s,t)=>s+Number(t.montant),0)) / totalCA) * 100) : 0}%</span>
          </div>
          <div style={{ width: '100%', height: '14px', display: 'flex', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ width: `${totalCA > 0 ? Math.min((totalSalaires / totalCA) * 100, 100) : 0}%`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${totalCA > 0 ? Math.min((totalChargesFixes / totalCA) * 100, 100) : 0}%`, backgroundColor: 'var(--danger)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${totalCA > 0 ? Math.max(((totalCA - totalSalaires - depenses.reduce((s,t)=>s+Number(t.montant),0)) / totalCA) * 100, 0) : 0}%`, backgroundColor: 'var(--success)', transition: 'width 0.5s ease' }} />
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

      {/* ── HISTORIQUE DES RÉDUCTIONS ET SOINS OFFERTS ─────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <Percent size={20} color="var(--warning)" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            Historique des Réductions et Soins Offerts
          </h2>
        </div>
        
        <div className="table-responsive">
          <table className="table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Date</th>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Client</th>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Prestation</th>
                <th style={{ padding: '10px 12px', fontWeight: '600' }}>Agent(s)</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Montant Réduit</th>
                <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'center' }}>Motif</th>
              </tr>
            </thead>
            <tbody>
              {reductionsList.length > 0 ? reductionsList.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                    {new Date(r.date).toLocaleDateString('fr-FR')} {new Date(r.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{r.client}</td>
                  <td style={{ padding: '12px' }}>{r.service}</td>
                  <td style={{ padding: '12px', color: 'var(--accent-color)' }}>{r.agents}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--warning)' }}>-{fmt(r.montant)} FCFA</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: 'var(--bg-input)', fontSize: '0.75rem', fontWeight: '600' }}>
                      {r.motif}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                    Aucune réduction accordée ce mois-ci.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            {/* TABLE RÉCAPITULATIVE PAR SERVICE */}
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem' }}>Service</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Qté</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Tarif moy.</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Part CA</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceList.map((s, i) => {
                    const pct = totalCA > 0 ? Math.round((s.total / totalCA) * 100) : 0;
                    const isOpen = expandedService === s.nom;
                    return (
                      <>
                        <tr key={`row-${i}`} style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border-color)', backgroundColor: isOpen ? 'rgba(37,99,235,0.04)' : 'transparent' }}>
                          <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{s.nom}</td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.85rem', backgroundColor: 'rgba(37,99,235,0.08)', color: 'var(--accent-color)', fontWeight: '700' }}>
                              {s.quantite}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(s.tarif)} FCFA</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--success)' }}>{fmt(s.total)} FCFA</td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                              <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '10px', minWidth: '50px' }}>
                                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--accent-color)', borderRadius: '10px' }} />
                              </div>
                              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--accent-color)', minWidth: '30px', textAlign: 'right' }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <button
                              onClick={() => setExpandedService(isOpen ? null : s.nom)}
                              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: '600' }}
                            >
                              {isOpen ? 'Masquer' : 'Voir detail'}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`detail-${i}`}>
                            <td colSpan="6" style={{ padding: '0', backgroundColor: 'rgba(37,99,235,0.03)', borderBottom: '2px solid var(--accent-color)' }}>
                              <div style={{ padding: '12px 20px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-color)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {s.quantite} prestation(s) de type &laquo; {s.nom} &raquo;
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                  <thead>
                                    <tr style={{ color: 'var(--text-muted)' }}>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Date</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Client</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Agent(s)</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Montant</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '600' }}>Mode</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.details.map((d, di) => (
                                      <tr key={di} style={{ borderTop: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{new Date(d.date).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ padding: '6px 8px', fontWeight: '500' }}>{d.client}</td>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{d.agents}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--success)' }}>{fmt(d.montant)} FCFA</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                          <span style={{ padding: '2px 8px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', fontSize: '0.78rem' }}>{d.mode}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-input)', borderTop: '2px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: '800', color: 'var(--text-main)' }}>TOTAL</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700' }}>{totalLignes}</td>
                    <td></td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--success)', fontSize: '1.05rem' }}>{fmt(totalCA)} FCFA</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text-muted)' }}>100%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
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



      {/* ── TENDANCES & HISTORIQUE MULTI-MOIS ──────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LineChart size={20} color="var(--accent-color)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              Évolution & Tendances
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
             <button className="btn btn-small" style={{ backgroundColor: trendGranularity === 'journalier' ? 'var(--accent-color)' : 'var(--bg-input)', color: trendGranularity === 'journalier' ? '#fff' : 'var(--text-main)', border: 'none' }} onClick={() => setTrendGranularity('journalier')}>Journalier</button>
             <button className="btn btn-small" style={{ backgroundColor: trendGranularity === 'hebdomadaire' ? 'var(--accent-color)' : 'var(--bg-input)', color: trendGranularity === 'hebdomadaire' ? '#fff' : 'var(--text-main)', border: 'none' }} onClick={() => setTrendGranularity('hebdomadaire')}>Hebdomadaire</button>
             <button className="btn btn-small" style={{ backgroundColor: trendGranularity === 'mensuel' ? 'var(--accent-color)' : 'var(--bg-input)', color: trendGranularity === 'mensuel' ? '#fff' : 'var(--text-main)', border: 'none' }} onClick={() => setTrendGranularity('mensuel')}>Mensuel (Global)</button>
          </div>
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
                        {d.isCurrent ? 'En cours' : (d.label || d.id)}
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
      {/* MODALE DE CLOTURE DES CHARGES FIXES */}
      {showClosureModal && (() => {
        const activeCharges = chargesFixes.filter(c => c.actif);
        const lines = activeCharges.map(c => {
          const realise = depenses.filter(t => t.categorie === c.nom).reduce((s, t) => s + Number(t.montant), 0);
          const budget = Number(c.montant) || 0;
          const ecart = budget - realise;
          return { ...c, realise, budget, ecart };
        });
        const ecartGlobal = lines.reduce((s, l) => s + l.ecart, 0);

        return (
          <div className="modal-overlay" onClick={() => setShowClosureModal(false)}>
            <div className="modal-content" style={{ maxWidth: '500px', width: '95%' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: '6px', fontSize: '1.15rem' }}>Cloture des charges — {MOIS_FR[viewMonth]} {viewYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Cette action va generer les transactions d'ajustement dans la tresorerie pour combler les deficits ou reverser les reliquats du mois.
              </p>

              {lines.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>Aucune charge active pour ce mois.</div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  {lines.map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                      <div>
                        <div style={{ fontWeight: '600' }}>{l.nom}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Budget: {l.budget.toLocaleString('fr-FR')} | Depense: {l.realise.toLocaleString('fr-FR')}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: '700', color: l.ecart > 0 ? 'var(--success)' : l.ecart < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {l.ecart === 0 ? 'Equilibre' : l.ecart > 0 ? `+ ${l.ecart.toLocaleString('fr-FR')} F` : `- ${Math.abs(l.ecart).toLocaleString('fr-FR')} F`}
                        <div style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>
                          {l.ecart > 0 ? 'Reversement' : l.ecart < 0 ? 'A combler' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                    <span>Ecart net global</span>
                    <span style={{ color: ecartGlobal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {ecartGlobal >= 0 ? `+${ecartGlobal.toLocaleString('fr-FR')}` : ecartGlobal.toLocaleString('fr-FR')} F
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {lines.length > 0 && (
                  <button
                    onClick={handleClosure}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isClosing}
                  >
                    {isClosing ? 'Regularisation en cours...' : 'Confirmer la cloture'}
                  </button>
                )}
                <button
                  onClick={() => setShowClosureModal(false)}
                  className="btn"
                  style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODALE DE CLOTURE DES SALAIRES */}
      {showSalariesClosureModal && (() => {
        const activeEmployes = employes.filter(e => e.actif);
        
        let totalGlobalRestant = 0;
        const employeeLines = activeEmployes.map(emp => {
          const verse = monthAvances.filter(a => a.employeId === emp.id).reduce((s, a) => s + Number(a.montant), 0);
          const base = Number(emp.salaireFixe) || 0;
          const reste = Math.max(0, base - verse);
          totalGlobalRestant += reste;
          return { ...emp, verse, base, reste };
        });

        let totalToPay = 0;
        if (salaryClosureMode === 'global') {
          totalToPay = totalGlobalRestant;
        } else {
          totalToPay = Object.values(individualSalariesForm).reduce((s, v) => s + (Number(v) || 0), 0);
        }

        return (
          <div className="modal-overlay" onClick={() => setShowSalariesClosureModal(false)}>
            <div className="modal-content" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: '6px', fontSize: '1.15rem' }}>Cloture des salaires — {MOIS_FR[viewMonth]} {viewYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Cette operation regularise le paiement des salaires. Les montants verses seront enregistres dans le journal des operations.
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button 
                  onClick={() => setSalaryClosureMode('global')}
                  className={`btn ${salaryClosureMode === 'global' ? 'btn-primary' : ''}`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'global' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'global' ? 'var(--text-main)' : undefined }}
                >
                  Globale
                </button>
                <button 
                  onClick={() => setSalaryClosureMode('individuel')}
                  className={`btn ${salaryClosureMode === 'individuel' ? 'btn-primary' : ''}`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'individuel' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'individuel' ? 'var(--text-main)' : undefined }}
                >
                  Individuelle par agent
                </button>
              </div>

              {totalGlobalRestant === 0 ? (
                <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', textAlign: 'center', color: 'var(--success)', fontWeight: '600', marginBottom: '16px' }}>
                  Tous les salaires de ce mois ont deja ete verses integralement via les avances.
                </div>
              ) : (
                <div style={{ marginBottom: '16px', backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {employeeLines.map(emp => (
                    <div key={emp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{emp.nom}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Base : {emp.base.toLocaleString('fr-FR')} F | Avances : {emp.verse.toLocaleString('fr-FR')} F
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{ fontSize: '0.8rem', color: emp.reste > 0 ? '#F59E0B' : 'var(--success)' }}>
                          Reste du : {emp.reste.toLocaleString('fr-FR')} F
                        </div>
                        {salaryClosureMode === 'individuel' && emp.reste > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>A verser :</label>
                            <input 
                              type="number"
                              min="0"
                              max={emp.reste}
                              value={individualSalariesForm[emp.id] !== undefined ? individualSalariesForm[emp.id] : ''}
                              onChange={(e) => setIndividualSalariesForm({ ...individualSalariesForm, [emp.id]: e.target.value })}
                              style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', textAlign: 'right' }}
                            />
                          </div>
                        )}
                        {salaryClosureMode === 'global' && emp.reste > 0 && (
                          <div style={{ fontWeight: '600', color: 'var(--accent-color)' }}>
                            Paiement : {emp.reste.toLocaleString('fr-FR')} F
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  <div style={{ marginTop: '14px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                    <span>Total a verser (Trésorerie)</span>
                    <span style={{ color: 'var(--danger)' }}>- {totalToPay.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {totalGlobalRestant > 0 && (
                  <button
                    onClick={handleClosureSalaries}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isClosingSalaries || totalToPay <= 0}
                  >
                    {isClosingSalaries ? 'Validation en cours...' : 'Valider la cloture'}
                  </button>
                )}
                <button
                  onClick={() => setShowSalariesClosureModal(false)}
                  className="btn"
                  style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
export default Bilan;
