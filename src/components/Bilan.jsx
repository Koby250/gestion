import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc as firestoreDeleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  TrendingUp, TrendingDown, Scissors, DollarSign,
  ChevronLeft, ChevronRight, BarChart2, Package, LineChart, Save, Trash2, Tag, User, Users, Percent, Receipt, Gift, Award, Star, Activity, ChevronDown, ChevronUp,
  PlusCircle, Edit2, X, Search, Filter
} from 'lucide-react';
import { computeGlobalPoints, computeDetailedGlobalStats, getPointsForService } from '../utils/points';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { logEvent } from '../utils/audit';

// Retourne la date locale en YYYY-MM-DD (évite le décalage UTC de toISOString)
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  const [expandedAvancesEmp, setExpandedAvancesEmp] = useState({});

  const [avances, setAvances] = useState([]);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [showSalariesClosureModal, setShowSalariesClosureModal] = useState(false);
  const [isClosingSalaries, setIsClosingSalaries] = useState(false);
  const [salaryClosureMode, setSalaryClosureMode] = useState('global');
  const [individualSalariesForm, setIndividualSalariesForm] = useState({});

  // ── États Section Dépenses ─────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [depenseForm, setDepenseForm] = useState({
    date: localDateStr(),
    categorie: '',
    montant: '',
    description: '',
    modePaiement: 'Cash',
  });
  const [depenseFilter, setDepenseFilter] = useState('mois'); // 'jour' | 'semaine' | 'mois' | 'tout'
  const [depenseSearch, setDepenseSearch] = useState('');
  const [isSavingDepense, setIsSavingDepense] = useState(false);
  const [editingDepenseId, setEditingDepenseId] = useState(null);
  const [editDepenseForm, setEditDepenseForm] = useState({});
  const [showDepenseForm, setShowDepenseForm] = useState(false);

  const toggleAgentDetails = (agentId) => {
    setExpandedAgents(prev => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  const handleClosure = async () => {
    setIsClosing(true);
    try {
      const moisLabel = `${MOIS_FR[viewMonth]} ${viewYear}`;
      const now = new Date().toISOString();
      const activeCharges = chargesFixes.filter(c => c.actif);

      // On enregistre uniquement les charges qui n'ont pas du tout été payées ce mois
      // (realise === 0 et budget > 0). Les charges déjà saisies en dépenses ne sont
      // PAS recréées pour éviter tout doublon.
      for (const c of activeCharges) {
        const realise = depenses
          .filter(t => t.categorie === c.nom)
          .reduce((s, t) => s + Number(t.montant), 0);
        const budget = Number(c.montant) || 0;

        if (realise > 0 || budget === 0) continue; // déjà payé ou pas de budget

        // Charge non encore payée → on l'enregistre comme dépense
        await addDoc(collection(db, 'transactions'), {
          type: 'depense',
          montant: budget,
          motif: `Cloture charge fixe — ${c.nom} (${moisLabel})`,
          categorie: c.nom,
          employeNom: 'Cloture Bilan',
          modePaiement: 'Interne',
          date: now,
          saisieParNom: 'Systeme — Bilan'
        });
      }

      setShowClosureModal(false);
      alert(`Cloture des charges fixes (${moisLabel}) enregistrée.`);
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
        // On compte uniquement les avances du mois comme déjà versés
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
            employeId: emp.id,
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

    const unsubAvances = onSnapshot(collection(db, 'avances_salaires'), snap => {
      setAvances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCats = onSnapshot(collection(db, 'depenses_categories'), snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.actif !== false));
    });

    return () => { unsub(); unsubHist(); unsubEmp(); unsubCharges(); unsubAvances(); unsubCats(); };
  }, []);

  // ── Handlers CRUD Dépenses ────────────────────────────────────────────────
  const handleAddDepense = async (e) => {
    e.preventDefault();
    if (!depenseForm.categorie || !depenseForm.montant || !depenseForm.date) return;
    setIsSavingDepense(true);
    try {
      const user = auth.currentUser;
      const nomAuteur = user?.email || 'Bilan';
      // Construire un ISO string à midi heure locale pour éviter tout décalage
      const dateISO = new Date(`${depenseForm.date}T12:00:00`).toISOString();
      await addDoc(collection(db, 'transactions'), {
        type: 'depense',
        montant: Number(depenseForm.montant),
        motif: depenseForm.description || depenseForm.categorie,
        categorie: depenseForm.categorie,
        modePaiement: depenseForm.modePaiement,
        date: dateISO,
        saisieParNom: nomAuteur,
        source: 'bilan',
      });
      await logEvent(
        'DEPENSE_CREATE',
        `Ajout dépense depuis Bilan — ${depenseForm.categorie} : ${Number(depenseForm.montant).toLocaleString('fr-FR')} FCFA (${depenseForm.description || 'sans description'}) le ${depenseForm.date}`
      );
      setDepenseForm({ date: localDateStr(), categorie: '', montant: '', description: '', modePaiement: 'Cash' });
      setShowDepenseForm(false);
    } catch (err) {
      console.error('[Bilan] Erreur ajout dépense:', err);
      alert('Erreur lors de l\'enregistrement.');
    } finally {
      setIsSavingDepense(false);
    }
  };

  const handleStartEditDepense = (t) => {
    if (t.isAvance) {
      alert("Les avances sur salaire doivent être modifiées depuis la page RH.");
      return;
    }
    setEditingDepenseId(t.id);
    setEditDepenseForm({
      date: localDateStr(new Date(t.date)),
      categorie: t.categorie || '',
      montant: t.montant || '',
      description: t.motif || '',
      modePaiement: t.modePaiement || 'Cash',
    });
  };

  const handleSaveEditDepense = async (id) => {
    try {
      const dateISO = new Date(`${editDepenseForm.date}T12:00:00`).toISOString();
      await updateDoc(doc(db, 'transactions', id), {
        montant: Number(editDepenseForm.montant),
        motif: editDepenseForm.description || editDepenseForm.categorie,
        categorie: editDepenseForm.categorie,
        modePaiement: editDepenseForm.modePaiement,
        date: dateISO,
      });
      await logEvent(
        'DEPENSE_UPDATE',
        `Modification dépense (Bilan) — ${editDepenseForm.categorie} : ${Number(editDepenseForm.montant).toLocaleString('fr-FR')} FCFA le ${editDepenseForm.date}`
      );
      setEditingDepenseId(null);
    } catch (err) {
      console.error('[Bilan] Erreur modification dépense:', err);
      alert('Erreur lors de la modification.');
    }
  };

  const handleDeleteDepense = async (t) => {
    if (t.isAvance) {
      alert("Les avances sur salaire doivent être supprimées depuis la page RH.");
      return;
    }
    if (!window.confirm(`Supprimer cette dépense de ${Number(t.montant).toLocaleString('fr-FR')} FCFA (${t.categorie}) ?`)) return;
    try {
      await firestoreDeleteDoc(doc(db, 'transactions', t.id));
      await logEvent(
        'DEPENSE_DELETE',
        `Suppression dépense (Bilan) — ${t.categorie} : ${Number(t.montant).toLocaleString('fr-FR')} FCFA (${t.motif || 'sans description'})`
      );
    } catch (err) {
      console.error('[Bilan] Erreur suppression dépense:', err);
      alert('Erreur lors de la suppression.');
    }
  };

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

  // Les dépenses pures : sans les avances (qui ont leur propre section)
  const prestations  = monthTx.filter(t => t.type === 'prestation');
  const depenses_raw = monthTx.filter(t => t.type === 'depense' && t.categoryId !== 'avance_salaire' && t.categoryNom !== 'Avance sur Salaire' && t.categorie !== 'Avance sur Salaire');

  // depenses = uniquement les vraies dépenses (charges, achats, etc.), avances exclues
  const depenses = depenses_raw;

  const totalCA       = prestations.reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = depenses.reduce((s, t) => s + Number(t.montant), 0);
  const beneficeNet   = totalCA - totalDepenses;
  const nbPrestations = prestations.length;

  const oldReductions = monthTx.filter(t => t.reductionActive === true);
  let totalReductions = oldReductions.reduce((s, t) => s + (Number(t.prixOriginal) - Number(t.montant)), 0);

  const totalSalaires     = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const totalChargesFixes = chargesFixes.filter(c => c.actif).reduce((acc, c) => acc + (Number(c.montant) || 0), 0);

  // Bilan Prévisionnel = CA encaissé - Budgets (Salaires + Charges Fixes)
  const tresorerieNette   = totalCA - totalSalaires - totalChargesFixes;
  const tresoreriePositive = tresorerieNette >= 0;

  const pctSalaires     = totalCA > 0 ? Math.min((totalSalaires     / totalCA) * 100, 100) : 0;
  const pctChargesFixes = totalCA > 0 ? Math.min((totalChargesFixes / totalCA) * 100, 100) : 0;
  const pctDepenses     = totalCA > 0 ? Math.min((totalDepenses     / totalCA) * 100, 100) : 0;
  const margeRestante   = Math.max(0, totalCA - totalSalaires - totalChargesFixes);
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
  // Utilise getPointsForService (même logique que l'Accueil) avec prise en compte de la date
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
        // Utilise la même fonction que l'Accueil pour les points
        const pts = getPointsForService(l.serviceNom, t.date, !!l.isDomicile);
        agents.forEach(ag => {
          if (!ag.id) return;
          if (!map[ag.id]) map[ag.id] = { points: 0, services: {} };
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

  // ── Indicateurs supplémentaires ──────────────────────────────────────────
  const totalAvancesMois = monthAvances.reduce((s, a) => s + Number(a.montant || 0), 0);

  // Top service du mois
  const topService = serviceList.length > 0 ? serviceList[0] : null;

  // Panier moyen par prestation (Ticket moyen)
  const nbPrestationsEffectives = prestations.length || 1;
  const panierMoyen = totalCA > 0 ? Math.round(totalCA / nbPrestationsEffectives) : 0;

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
      label: 'Avances sur Salaires',
      value: `${fmt(totalAvancesMois)} FCFA`,
      icon: <TrendingDown size={22} />,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
      subtitle: `${monthAvances.length} avance${monthAvances.length !== 1 ? 's' : ''} versée${monthAvances.length !== 1 ? 's' : ''}`
    },
    {
      label: 'Total Dépenses',
      value: `${fmt(totalDepenses)} FCFA`,
      icon: <TrendingDown size={22} />,
      color: 'var(--danger)',
      bg: 'rgba(239, 68, 68, 0.08)',
      subtitle: 'Charges et dépenses courantes'
    },
    {
      label: 'Bénéfice Net',
      value: `${beneficeNet >= 0 ? '+' : ''}${fmt(beneficeNet)} FCFA`,
      icon: <DollarSign size={22} />,
      color: beneficeNet >= 0 ? 'var(--success)' : 'var(--danger)',
      bg: beneficeNet >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
      subtitle: 'CA − Dépenses (avances en sus)'
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
                {card.subtitle && (
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                    {card.subtitle}
                  </div>
                )}
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

      {/* ── INDICATEURS STRATÉGIQUES ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {/* Panier Moyen */}
        <div style={{
          backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px 20px',
          border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', gap: '14px'
        }}>
          <div style={{ backgroundColor: 'rgba(139,92,246,0.12)', color: '#8b5cf6', padding: '12px', borderRadius: '12px', flexShrink: 0 }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '4px' }}>Panier moyen global</div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#8b5cf6', letterSpacing: '-0.02em' }}>{fmt(panierMoyen)} F</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '3px', fontStyle: 'italic' }}>Sur {prestations.length} prestation{prestations.length > 1 ? 's' : ''} sur la période</div>
          </div>
        </div>

        {/* Top Service */}
        {topService && (
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px 20px',
            border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: '14px'
          }}>
            <div style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '12px', borderRadius: '12px', flexShrink: 0 }}>
              <Star size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Top service du mois</div>
                <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '1px 7px', borderRadius: '10px', backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>N°1</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topService.nom}</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                {topService.quantite} fois — <span style={{ color: '#f59e0b', fontWeight: '700' }}>{fmt(topService.total)} F</span> générés
              </div>
            </div>
          </div>
        )}
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

              const Rank1Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.18 }} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
                  {[0,30,60,90,120,150,180,210,240,270,300,330].map((angle, i) => (
                    <line key={i} x1="150" y1="0"
                      x2={150 + Math.cos((angle - 90) * Math.PI/180) * 300}
                      y2={Math.sin((angle - 90) * Math.PI/180) * 300}
                      stroke="#D4A853" strokeWidth="0.8" strokeDasharray="4 8"
                    />
                  ))}
                  <circle cx="150" cy="0" r="80" fill="none" stroke="#D4A853" strokeWidth="0.6" />
                  <circle cx="150" cy="0" r="140" fill="none" stroke="#D4A853" strokeWidth="0.4" />
                  <path d="M0,0 L40,0 L0,40 Z" fill="#D4A853" opacity="0.15"/>
                  <path d="M300,0 L260,0 L300,40 Z" fill="#D4A853" opacity="0.15"/>
                  <line x1="30" y1="380" x2="270" y2="380" stroke="#D4A853" strokeWidth="0.6" />
                  <circle cx="150" cy="380" r="3" fill="#D4A853" />
                </svg>
              );

              const Rank2Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.15 }} viewBox="0 0 260 360" preserveAspectRatio="xMidYMid slice">
                  {[0,1,2,3].map(row => [0,1,2,3].map(col => (
                    <polygon key={`${row}-${col}`}
                      points={`${col*70 + (row%2)*35},${row*60} ${col*70+(row%2)*35+30},${row*60} ${col*70+(row%2)*35+45},${row*60+25} ${col*70+(row%2)*35+30},${row*60+50} ${col*70+(row%2)*35},${row*60+50} ${col*70+(row%2)*35-15},${row*60+25}`}
                      fill="none" stroke="#A8B4C4" strokeWidth="0.5"
                    />
                  )))}
                  <path d="M10,10 L25,0 L40,10 L25,20 Z" fill="#A8B4C4" opacity="0.2"/>
                  <path d="M220,10 L235,0 L250,10 L235,20 Z" fill="#A8B4C4" opacity="0.2"/>
                  <line x1="0" y1="100" x2="15" y2="100" stroke="#A8B4C4" strokeWidth="1.5"/>
                  <line x1="245" y1="100" x2="260" y2="100" stroke="#A8B4C4" strokeWidth="1.5"/>
                </svg>
              );

              const Rank3Decor = () => (
                <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.15 }} viewBox="0 0 260 360" preserveAspectRatio="xMidYMid slice">
                  <line x1="0" y1="0" x2="260" y2="360" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="6 12"/>
                  <line x1="260" y1="0" x2="0" y2="360" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="6 12"/>
                  <polygon points="0,0 50,0 0,50" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="260,0 210,0 260,50" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="0,360 50,360 0,310" fill="#CD7C3E" opacity="0.12"/>
                  <polygon points="260,360 210,360 260,310" fill="#CD7C3E" opacity="0.12"/>
                  <circle cx="130" cy="180" r="80" fill="none" stroke="#CD7C3E" strokeWidth="0.5" strokeDasharray="4 8"/>
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
                  shadowStyle: '0 0 0 1px #6B3A18, 0 0 14px rgba(205,124,62,0.18), 0 10px 30px rgba(0,0,0,0.6)',
                  Decor:       Rank3Decor,
                  padding:     '24px 18px 18px',
                  flex:        '1 1 28%',
                  order:       3,
                },
              };

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
                        <Decor />

                        {/* Médaille */}
                        <div style={{ position:'relative', zIndex:2, marginBottom:'14px', marginTop: isFirst ? '10px' : '4px' }}>
                          <div style={{
                            width: `${cfg.crownSize + 16}px`, height: `${cfg.crownSize + 16}px`,
                            borderRadius:'50%',
                            background: `conic-gradient(from 0deg, transparent 30%, ${cfg.accentColor}55 50%, transparent 70%)`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            animation: isFirst ? 'spin 8s linear infinite' : undefined,
                          }}>
                            <div style={{
                              width: `${cfg.crownSize + 4}px`, height: `${cfg.crownSize + 4}px`,
                              borderRadius:'50%',
                              background: 'rgba(0,0,0,0.6)',
                              border: `1.5px solid ${cfg.borderColor}`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}>
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

                        {/* Séparateur ornemental */}
                        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'10px', zIndex:2, width:'80%' }}>
                          <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg, transparent, ${cfg.accentColor}60)` }} />
                          <div style={{ width:'5px', height:'5px', borderRadius:'50%', background: cfg.accentColor, boxShadow:`0 0 6px ${cfg.accentColor}` }} />
                          <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg, ${cfg.accentColor}60, transparent)` }} />
                        </div>

                        <div style={{ fontWeight:'800', fontSize: cfg.fontSize, color:'#FFFFFF', marginBottom:'4px', letterSpacing:'-0.02em', lineHeight:1.2, zIndex:2, textShadow: isFirst ? `0 0 20px ${cfg.glowColor}` : 'none' }}>
                          {agent.nom}
                        </div>

                        <div style={{ fontSize: cfg.ptsFontSize, fontWeight:'900', color: cfg.accentColor, letterSpacing:'-0.04em', lineHeight:1, marginBottom:'12px', zIndex:2, textShadow:`0 0 24px ${cfg.glowColor}, 0 0 48px ${cfg.glowColor}` }}>
                          {agent.points}
                          <span style={{ fontSize:'0.55em', fontWeight:'700', marginLeft:'4px', opacity:0.75 }}>PTS</span>
                        </div>

                        {/* Soins */}
                        <div style={{ width:'100%', zIndex:2, marginBottom:'12px' }}>
                          <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${cfg.borderColor}`, borderRadius:'10px', padding:'8px 14px', textAlign:'center' }}>
                            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'3px' }}>Soins cette période</div>
                            <div style={{ fontSize:'1.2rem', fontWeight:'900', color: cfg.accentColor }}>{agent.totalServicesCount}</div>
                          </div>
                        </div>

                        {/* Badge polyvalent */}
                        {agent.polyvalent && (
                          <div style={{ marginBottom:'10px', zIndex:2 }}>
                            <span style={{ fontSize:'0.62rem', fontWeight:'700', color:'#c084fc', border:'1px solid rgba(192,132,252,0.35)', background:'rgba(192,132,252,0.08)', padding:'3px 10px', borderRadius:'99px', display:'inline-flex', alignItems:'center', gap:'5px', letterSpacing:'0.06em' }}>
                              <Star size={8} /> Polyvalent
                            </span>
                          </div>
                        )}

                        {/* Détails soins toggle */}
                        {agent.totalServicesCount > 0 && (
                          <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:'8px', display:'flex', alignItems:'center', gap:'4px', zIndex:2, cursor:'pointer' }}>
                            <Scissors size={10} />
                            {expandedAgents[agent.id] ? 'Masquer' : 'Voir le détail'}
                            {expandedAgents[agent.id] ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                          </div>
                        )}

                        {expandedAgents[agent.id] && Object.entries(agent.servicesCount || {}).length > 0 && (
                          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', justifyContent:'center', marginBottom:'10px', zIndex:2 }}>
                            {Object.entries(agent.servicesCount).map(([sName, sCount]) => (
                              <span key={sName} style={{ fontSize:'0.62rem', background:'rgba(255,255,255,0.03)', border:`1px solid ${cfg.borderColor}`, padding:'2px 8px', borderRadius:'6px', color: cfg.accentColor, fontWeight:'600' }}>
                                {sCount}× {sName}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Barre de progression */}
                        <div style={{ width:'100%', zIndex:2 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.62rem', color:'var(--text-muted)', marginBottom:'5px' }}>
                            <span>{rank === 1 ? 'Leader' : `${(allAgentsRankedFiltered[0].points - agent.points).toFixed(1)} pts pour le 1er`}</span>
                            <span style={{ color: cfg.accentColor, fontWeight:700 }}>{Math.round(progressPct)}%</span>
                          </div>
                          <div style={{ height:'6px', borderRadius:'99px', background:'rgba(255,255,255,0.05)', overflow:'hidden', position:'relative' }}>
                            <div style={{ height:'100%', width:`${progressPct}%`, background: cfg.barGradient, borderRadius:'99px', transition:'width 1s cubic-bezier(0.34,1.56,0.64,1)', boxShadow:`0 0 10px ${cfg.glowColor}` }} />
                          </div>
                        </div>

                        {/* Ligne décorative bas */}
                        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'2px', background: cfg.barGradient, opacity: isFirst ? 1 : 0.55 }} />

                        {/* Coins décoratifs */}
                        <div style={{ position:'absolute', bottom:'12px', left:'12px', width:'10px', height:'10px', borderLeft:`1px solid ${cfg.accentColor}50`, borderBottom:`1px solid ${cfg.accentColor}50`, borderRadius:'0 0 0 4px' }} />
                        <div style={{ position:'absolute', bottom:'12px', right:'12px', width:'10px', height:'10px', borderRight:`1px solid ${cfg.accentColor}50`, borderBottom:`1px solid ${cfg.accentColor}50`, borderRadius:'0 0 4px 0' }} />
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
              const totalVerse = employes.filter(e => e.actif).reduce((s, emp) => {
                const avancesEmp = monthAvances.filter(a => a.employeId === emp.id).reduce((x, a) => x + Number(a.montant), 0);
                const paiementsEmp = depenses.filter(t => (t.categorie === 'Paiement Salaires' || t.categorie === 'Salaires') && (t.employeId === emp.id || (t.motif && t.motif.includes(emp.nom)))).reduce((x, t) => x + Number(t.montant), 0);
                return s + avancesEmp + paiementsEmp;
              }, 0);
              
              const pctVerse = totalSalaires > 0 ? Math.min((totalVerse / totalSalaires) * 100, 100) : 0;
              const overBudget = totalVerse > totalSalaires;
              const completed = totalVerse >= totalSalaires;

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: overBudget ? 'var(--danger)' : 'var(--accent-color)' }}>
                      {totalVerse.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>/ {totalSalaires.toLocaleString('fr-FR')} F (total)</div>
                  </div>
                  
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: `${pctVerse}%`, backgroundColor: overBudget ? 'var(--danger)' : completed ? 'var(--success)' : 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Part du CA global</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalCA > 0 ? Math.round(pctSalaires) : 0}%</span>
                  </div>
                  {totalSalaires - totalVerse !== 0 && (
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: overBudget ? 'var(--danger)' : 'var(--text-main)', marginBottom: '8px' }}>
                      {overBudget ? `Depassement : ${(totalVerse - totalSalaires).toLocaleString('fr-FR')} F` : `Reste a verser : ${(totalSalaires - totalVerse).toLocaleString('fr-FR')} F`}
                    </div>
                  )}
                  {completed && !overBudget && (
                     <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--success)', marginBottom: '8px' }}>Salaires entierement verses</div>
                  )}
                </>
              );
            })()}

            {employes.filter(e => e.actif).length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid rgba(37,99,235,0.15)', paddingTop: '10px' }}>
                {employes.filter(e => e.actif).map(e => {
                  const avancesEmp = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                  const paiementsEmp = depenses.filter(t => (t.categorie === 'Paiement Salaires' || t.categorie === 'Salaires') && (t.employeId === e.id || (t.motif && t.motif.includes(e.nom)))).reduce((x, t) => x + Number(t.montant), 0);
                  const verse = avancesEmp + paiementsEmp;
                  const base = Number(e.salaireFixe) || 0;
                  const reste = Math.max(0, base - verse);
                  const pct = base > 0 ? Math.min((verse / base) * 100, 100) : 0;
                  const overBudget = verse > base;
                  const barColor = overBudget ? 'var(--danger)' : pct > 75 && pct < 100 ? '#F59E0B' : pct >= 100 ? 'var(--success)' : 'var(--accent-color)';

                  return (
                    <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(37,99,235,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{e.nom}</span>
                        <span style={{ fontWeight: '600', color: overBudget ? 'var(--danger)' : 'var(--text-main)' }}>
                          {verse.toLocaleString('fr-FR')} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ {base.toLocaleString('fr-FR')} F</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        {overBudget ? (
                          <div style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Depassement : {(verse - base).toLocaleString('fr-FR')} F</div>
                        ) : reste > 0 ? (
                          <div style={{ fontSize: '0.72rem', color: '#F59E0B' }}>Reste : {reste.toLocaleString('fr-FR')} F</div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>Solde</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {employes.filter(e => e.actif).length > 0 && (
              <button
                onClick={() => {
                  const initForm = {};
                  employes.filter(e => e.actif).forEach(e => {
                    const avancesEmp = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                    const paiementsEmp = depenses.filter(t => (t.categorie === 'Paiement Salaires' || t.categorie === 'Salaires') && (t.employeId === e.id || (t.motif && t.motif.includes(e.nom)))).reduce((x, t) => x + Number(t.montant), 0);
                    const verse = avancesEmp + paiementsEmp;
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
              Seuil de Rentabilité & Marge Réelle
            </div>
            {(() => {
              const seuilRentabilite = totalSalaires + totalChargesFixes;
              const caPct = seuilRentabilite > 0 ? Math.min((totalCA / seuilRentabilite) * 100, 100) : 100;
              const seuilAtteint = totalCA >= seuilRentabilite;
              
              const totalD = depenses.reduce((s, t) => s + Number(t.montant), 0);
              const totalDepensesReelles = totalD;
              const margeNetteReelle = totalCA - totalDepensesReelles;
              const margePctReelle = totalCA > 0 ? (margeNetteReelle / totalCA) * 100 : 0;

              return (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Point Mort (Budgets alloués)</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{seuilRentabilite.toLocaleString('fr-FR')} F</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CA Actuel encaissé</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: seuilAtteint ? 'var(--success)' : '#F59E0B' }}>{totalCA.toLocaleString('fr-FR')} F</div>
                      </div>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '4px' }}>
                      <div style={{ height: '100%', width: `${caPct}%`, backgroundColor: seuilAtteint ? 'var(--success)' : '#F59E0B', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '600', color: seuilAtteint ? 'var(--success)' : '#F59E0B', textAlign: 'center' }}>
                      {seuilAtteint ? `Seuil dépassé de ${(totalCA - seuilRentabilite).toLocaleString('fr-FR')} F` : `Manque ${(seuilRentabilite - totalCA).toLocaleString('fr-FR')} F pour atteindre le point mort`}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Marge Nette Opérationnelle (Trésorerie Réelle)</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', fontStyle: 'italic' }}>
                      CA Actuel − Dépenses réelles payées ({totalDepensesReelles.toLocaleString('fr-FR')} F)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: '800', color: margeNetteReelle >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {margePctReelle.toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '0.85rem', color: margeNetteReelle >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                        ({margeNetteReelle >= 0 ? '+' : ''}{margeNetteReelle.toLocaleString('fr-FR')} F)
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Jauge Globale de Répartition du CA (Trésorerie Réelle) */}
        {(() => {
           const paiementsSalairesReels = depenses.filter(t => t.categorie === 'Paiement Salaires' || t.categorie === 'Salaires' || t.categorie === 'Avance sur Salaire').reduce((x, t) => x + Number(t.montant), 0);
           const autresDepenses = depenses.reduce((s, t) => s + Number(t.montant), 0) - paiementsSalairesReels;
           
           const margeReelle = totalCA - paiementsSalairesReels - autresDepenses;
           const pctSalaires = totalCA > 0 ? (paiementsSalairesReels / totalCA) * 100 : 0;
           const pctAutres = totalCA > 0 ? (autresDepenses / totalCA) * 100 : 0;
           const pctMarge = totalCA > 0 ? Math.max((margeReelle / totalCA) * 100, 0) : 0;

           return (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Répartition réelle du CA encaissé
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--accent-color)' }}>Salaires Payés : {totalCA > 0 ? Math.round(pctSalaires) : 0}%</span>
                  <span style={{ color: 'var(--danger)' }}>Autres Dépenses : {totalCA > 0 ? Math.round(pctAutres) : 0}%</span>
                  <span style={{ color: 'var(--success)' }}>Marge Nette : {totalCA > 0 ? Math.round(pctMarge) : 0}%</span>
                </div>
                <div style={{ width: '100%', height: '14px', display: 'flex', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
                  <div style={{ width: `${Math.min(pctSalaires, 100)}%`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease' }} />
                  <div style={{ width: `${Math.min(pctAutres, 100)}%`, backgroundColor: 'var(--danger)', transition: 'width 0.5s ease' }} />
                  <div style={{ width: `${pctMarge}%`, backgroundColor: 'var(--success)', transition: 'width 0.5s ease' }} />
                </div>
              </div>
           );
        })()}

        {/* Bilan Prévisionnel du Mois */}
        <div style={{
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: tresoreriePositive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${tresoreriePositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Bilan Prévisionnel du Mois = CA encaissé − Budgets (Salaires + Charges Fixes)
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
              ? `Le CA couvre intégralement les budgets de charges fixes et de salaires. Marge théorique restante : ${fmt(margeRestante)} F.`
              : `Attention : le CA actuel ne couvre pas encore tous les budgets du mois (déficit théorique de ${fmt(Math.abs(tresorerieNette))} F).`
            }
          </div>
        </div>
      </div>

      {/* ── HISTORIQUE DES DÉPENSES ───────────────────────────────────────── */}
      {(() => {
        // ── Filtre par période (dates locales) ────────────────────────────
        const now2 = new Date();
        const filteredDepenses = depenses
          .filter(t => {
            const d = new Date(t.date);
            if (depenseFilter === 'jour') {
              return localDateStr(d) === localDateStr();
            }
            if (depenseFilter === 'semaine') {
              const dow = now2.getDay() === 0 ? 7 : now2.getDay();
              const monday = new Date(now2); monday.setDate(now2.getDate() - dow + 1); monday.setHours(0,0,0,0);
              const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
              return d >= monday && d <= sunday;
            }
            if (depenseFilter === 'mois') return d >= start && d <= end;
            return true; // 'tout'
          })
          .filter(t => {
            if (!depenseSearch) return true;
            const s = depenseSearch.toLowerCase();
            return (t.motif || '').toLowerCase().includes(s)
                || (t.categorie || '').toLowerCase().includes(s)
                || (t.modePaiement || '').toLowerCase().includes(s);
          })
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalFiltreDepenses = filteredDepenses.reduce((s, t) => s + Number(t.montant), 0);

        // Labels de toutes les catégories connues (fixes + libres)
        const allCatLabels = [
          ...categories.map(c => c.nom),
          ...chargesFixes.filter(c => c.actif).map(c => c.nom),
        ].filter((v, i, arr) => arr.indexOf(v) === i).sort();

        return (
          <div className="card" style={{ marginBottom: '24px' }}>
            {/* En-tête */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Receipt size={20} color="var(--danger)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                  Historique des Dépenses — {MOIS_FR[viewMonth]} {viewYear}
                </h2>
              </div>
              <button
                onClick={() => setShowDepenseForm(v => !v)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <PlusCircle size={16} />
                {showDepenseForm ? 'Annuler' : 'Ajouter une dépense'}
              </button>
            </div>

            {/* Formulaire d'ajout */}
            {showDepenseForm && (
              <form
                onSubmit={handleAddDepense}
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '12px', padding: '16px', borderRadius: '12px',
                  backgroundColor: 'var(--bg-input)', marginBottom: '20px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Date</label>
                  <input
                    type="date"
                    className="input-control"
                    style={{ margin: 0 }}
                    value={depenseForm.date}
                    max={localDateStr()}
                    onChange={e => setDepenseForm({ ...depenseForm, date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Catégorie *</label>
                  <select
                    className="input-control"
                    style={{ margin: 0 }}
                    value={depenseForm.categorie}
                    onChange={e => setDepenseForm({ ...depenseForm, categorie: e.target.value })}
                    required
                  >
                    <option value="">Sélectionner...</option>
                    {chargesFixes.filter(c => c.actif).length > 0 && (
                      <optgroup label="Charges Fixes">
                        {chargesFixes.filter(c => c.actif).map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                      </optgroup>
                    )}
                    {categories.filter(c => !chargesFixes.some(cf => cf.nom === c.nom)).length > 0 && (
                      <optgroup label="Autres Catégories">
                        {categories.filter(c => !chargesFixes.some(cf => cf.nom === c.nom)).map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Montant (FCFA) *</label>
                  <input
                    type="number"
                    className="input-control"
                    style={{ margin: 0 }}
                    placeholder="Ex: 15000"
                    value={depenseForm.montant}
                    onChange={e => setDepenseForm({ ...depenseForm, montant: e.target.value })}
                    required
                    min="1"
                  />
                </div>

                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
                  <input
                    type="text"
                    className="input-control"
                    style={{ margin: 0 }}
                    placeholder="Ex: Achat produits capillaires..."
                    value={depenseForm.description}
                    onChange={e => setDepenseForm({ ...depenseForm, description: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Mode de paiement</label>
                  <select
                    className="input-control"
                    style={{ margin: 0 }}
                    value={depenseForm.modePaiement}
                    onChange={e => setDepenseForm({ ...depenseForm, modePaiement: e.target.value })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="NITA">NITA</option>
                    <option value="AMANA">AMANA</option>
                    <option value="Carte VISA">Carte VISA</option>
                    <option value="Interne">Interne</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSavingDepense}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Save size={15} />
                    {isSavingDepense ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            )}

            {/* Filtres + Recherche */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
              {/* Filtres période */}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-input)', padding: '4px', borderRadius: '10px' }}>
                {[['jour', "Aujourd'hui"], ['semaine', 'Semaine'], ['mois', 'Ce mois'], ['tout', 'Tout']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setDepenseFilter(val)}
                    className={`nav-btn ${depenseFilter === val ? 'active' : ''}`}
                    style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                  >{label}</button>
                ))}
              </div>

              {/* Recherche */}
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="input-control"
                  style={{ paddingLeft: '32px', margin: 0 }}
                  placeholder="Rechercher catégorie, description..."
                  value={depenseSearch}
                  onChange={e => setDepenseSearch(e.target.value)}
                />
              </div>

              {/* Compteur + Total */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{filteredDepenses.length} dépense{filteredDepenses.length > 1 ? 's' : ''}</span>
                <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--danger)' }}>−{fmt(totalFiltreDepenses)} FCFA</span>
              </div>
            </div>

            {/* Tableau */}
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: '600' }}>Date</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600' }}>Catégorie</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600' }}>Description</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600' }}>Mode</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'right' }}>Montant</th>
                    <th style={{ padding: '10px 12px', fontWeight: '600', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepenses.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>Aucune dépense pour cette période.</td></tr>
                  ) : (
                    filteredDepenses.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: editingDepenseId === t.id ? 'rgba(37,99,235,0.04)' : 'transparent' }}>
                        {editingDepenseId === t.id ? (
                          // ── Mode édition inline ──────────────────────────
                          <>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="date"
                                className="input-control"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.82rem', width: '130px' }}
                                value={editDepenseForm.date}
                                max={localDateStr()}
                                onChange={e => setEditDepenseForm({ ...editDepenseForm, date: e.target.value })}
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                className="input-control"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.82rem', width: '140px' }}
                                value={editDepenseForm.categorie}
                                onChange={e => setEditDepenseForm({ ...editDepenseForm, categorie: e.target.value })}
                              >
                                {allCatLabels.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                className="input-control"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.82rem' }}
                                value={editDepenseForm.description}
                                onChange={e => setEditDepenseForm({ ...editDepenseForm, description: e.target.value })}
                                placeholder="Description"
                              />
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                className="input-control"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.82rem', width: '100px' }}
                                value={editDepenseForm.modePaiement}
                                onChange={e => setEditDepenseForm({ ...editDepenseForm, modePaiement: e.target.value })}
                              >
                                {['Cash','NITA','AMANA','Carte VISA','Interne'].map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                className="input-control"
                                style={{ margin: 0, padding: '4px 8px', fontSize: '0.82rem', width: '100px', textAlign: 'right' }}
                                value={editDepenseForm.montant}
                                onChange={e => setEditDepenseForm({ ...editDepenseForm, montant: e.target.value })}
                                min="1"
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleSaveEditDepense(t.id)}
                                  className="btn btn-small btn-success"
                                  title="Enregistrer"
                                ><Save size={13} /></button>
                                <button
                                  onClick={() => setEditingDepenseId(null)}
                                  className="btn btn-small"
                                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                                  title="Annuler"
                                ><X size={13} /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          // ── Mode lecture ──────────────────────────────────
                          <>
                            <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {new Date(t.date).toLocaleDateString('fr-FR')}
                              <div style={{ fontSize: '0.75rem' }}>{new Date(t.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)' }}>
                                {t.categorie || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-main)' }}>
                              {t.motif || '—'}
                              {t.saisieParNom && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>par {t.saisieParNom}</div>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-input)', fontSize: '0.78rem', fontWeight: '600' }}>
                                {t.modePaiement || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                              −{fmt(Number(t.montant))} FCFA
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleStartEditDepense(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)', padding: '4px' }}
                                  title="Modifier"
                                ><Edit2 size={15} /></button>
                                <button
                                  onClick={() => handleDeleteDepense(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                  title="Supprimer"
                                ><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredDepenses.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'rgba(239,68,68,0.04)' }}>
                      <td colSpan="4" style={{ padding: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Total des dépenses affichées</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: 'var(--danger)', fontSize: '1rem' }}>−{fmt(totalFiltreDepenses)} FCFA</td>
                      <td />
                    </tr>
                    <tr style={{ backgroundColor: 'rgba(16,185,129,0.04)' }}>
                      <td colSpan="4" style={{ padding: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Bénéfice Net (CA − Dépenses du mois)</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '800', color: beneficeNet >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1rem' }}>
                        {beneficeNet >= 0 ? '+' : ''}{fmt(beneficeNet)} FCFA
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── AVANCES SUR SALAIRES ──────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={20} color="#f59e0b" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              Avances sur Salaires — {MOIS_FR[viewMonth]} {viewYear}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {monthAvances.length} avance{monthAvances.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontWeight: '800', fontSize: '1rem', color: '#f59e0b' }}>
              -{fmt(totalAvancesMois)} FCFA
            </span>
          </div>
        </div>

        {monthAvances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <p>Aucune avance sur salaire ce mois-ci.</p>
          </div>
        ) : (() => {
          const byEmp = {};
          monthAvances.forEach(a => {
            const key = a.employeId || a.employeNom || 'Inconnu';
            if (!byEmp[key]) byEmp[key] = { nom: a.employeNom || 'Inconnu', avances: [], total: 0 };
            byEmp[key].avances.push(a);
            byEmp[key].total += Number(a.montant || 0);
          });

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.values(byEmp).sort((a, b) => b.total - a.total).map((emp, idx) => {
                const isExpanded = !!expandedAvancesEmp[emp.nom];
                return (
                  <div key={idx} style={{ backgroundColor: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div 
                      onClick={() => setExpandedAvancesEmp(prev => ({ ...prev, [emp.nom]: !isExpanded }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: (isExpanded && emp.avances.length > 0) ? '1px solid var(--border-color)' : 'none', backgroundColor: 'rgba(245,158,11,0.06)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={15} color="#f59e0b" />
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>{emp.nom}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.avances.length} avance{emp.avances.length > 1 ? 's' : ''} ce mois</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#f59e0b' }}>
                          -{fmt(emp.total)} FCFA
                        </div>
                        {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div>
                        {emp.avances
                          .sort((a, b) => new Date(b.date) - new Date(a.date))
                          .map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px 9px 58px', borderBottom: i < emp.avances.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '80px' }}>
                                  {new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </span>
                                {a.motif && (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{a.motif}</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {a.modePaiement && (
                                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                    {a.modePaiement}
                                  </span>
                                )}
                                <span style={{ fontWeight: '700', color: '#f59e0b', fontSize: '0.9rem' }}>
                                  -{fmt(Number(a.montant || 0))} F
                                </span>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0 4px' }}>
                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#f59e0b' }}>
                  Total avances du mois : -{fmt(totalAvancesMois)} FCFA
                </div>
              </div>
            </div>
          );
        })()}
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
          // Seules les avances du mois comptent comme déjà versé
          const avancesEmp = monthAvances.filter(a => a.employeId === emp.id).reduce((s, a) => s + Number(a.montant), 0);
          const base = Number(emp.salaireFixe) || 0;
          const reste = Math.max(0, base - avancesEmp);
          totalGlobalRestant += reste;
          return { ...emp, avancesEmp, base, reste };
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
              <h2 style={{ marginBottom: '6px', fontSize: '1.15rem' }}>Clôture des salaires — {MOIS_FR[viewMonth]} {viewYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Choisissez le mode de clôture puis cliquez sur Confirmer. Les montants versés seront enregistrés dans le journal des opérations.
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button 
                  onClick={() => setSalaryClosureMode('global')}
                  className={`btn ${salaryClosureMode === 'global' ? 'btn-primary' : ''}`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'global' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'global' ? 'var(--text-main)' : undefined }}
                >
                  Globale (auto)
                </button>
                <button 
                  onClick={() => setSalaryClosureMode('individuel')}
                  className={`btn ${salaryClosureMode === 'individuel' ? 'btn-primary' : ''}`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'individuel' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'individuel' ? 'var(--text-main)' : undefined }}
                >
                  Par agent
                </button>
              </div>

              <div style={{ marginBottom: '16px', backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {employeeLines.map(emp => (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{emp.nom}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Salaire de base : {emp.base.toLocaleString('fr-FR')} F | Avances : {emp.avancesEmp.toLocaleString('fr-FR')} F
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ fontSize: '0.8rem', color: emp.reste > 0 ? '#F59E0B' : 'var(--success)', fontWeight: '600' }}>
                        {emp.reste > 0 ? `Reste : ${emp.reste.toLocaleString('fr-FR')} F` : 'Soldé'}
                      </div>
                      {salaryClosureMode === 'individuel' && emp.reste > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>À verser :</label>
                          <input 
                            type="number"
                            min="0"
                            max={emp.reste}
                            value={individualSalariesForm[emp.id] !== undefined ? individualSalariesForm[emp.id] : emp.reste}
                            onChange={(e) => setIndividualSalariesForm({ ...individualSalariesForm, [emp.id]: e.target.value })}
                            style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', textAlign: 'right' }}
                          />
                        </div>
                      )}
                      {salaryClosureMode === 'global' && emp.reste > 0 && (
                        <div style={{ fontWeight: '700', color: 'var(--danger)', fontSize: '0.9rem' }}>
                          {emp.reste.toLocaleString('fr-FR')} F
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: '14px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', borderTop: '2px solid var(--border-color)' }}>
                  <span>Total à verser</span>
                  <span style={{ color: totalToPay > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {totalToPay > 0 ? `- ${totalToPay.toLocaleString('fr-FR')} F` : 'Tout soldé'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleClosureSalaries}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', fontSize: '0.95rem', fontWeight: '700' }}
                  disabled={isClosingSalaries || totalToPay <= 0}
                >
                  {isClosingSalaries ? 'Validation en cours...' : totalToPay > 0 ? `Confirmer la clôture (${totalToPay.toLocaleString('fr-FR')} F)` : 'Salaires déjà tous versés'}
                </button>
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
