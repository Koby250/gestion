import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Wallet, ArrowRightLeft, Edit2, CheckCircle, Search, Calendar,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Globe,
  CalendarDays, TrendingUp, TrendingDown, Layers, RotateCcw,
  Banknote, Smartphone, CreditCard, Coins, Check
} from 'lucide-react';
import { logEvent } from '../utils/audit';
import SuccessModal from './SuccessModal';

const accountsList = [
  { id: 'cash', label: 'Cash (Espèces)', sub: 'Caisse salon' },
  { id: 'nita', label: 'Nita', sub: 'Compte Nita' },
  { id: 'amana', label: 'Amana', sub: 'Compte Amana' },
  { id: 'visa', label: 'Carte VISA / Banque', sub: 'Compte bancaire' },
  { id: 'autre', label: 'Autre', sub: 'Autres comptes' }
];

const getAccountIcon = (id, size = 18) => {
  switch (id) {
    case 'cash':
      return <Banknote size={size} color="#10B981" />;
    case 'nita':
      return <Smartphone size={size} color="#F59E0B" />;
    case 'amana':
      return <Smartphone size={size} color="#3B82F6" />;
    case 'visa':
      return <CreditCard size={size} color="#8B5CF6" />;
    default:
      return <Coins size={size} color="#6B7280" />;
  }
};

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const getModeKey = (m) => {
  if (!m) return 'cash';
  const lower = m.toLowerCase();
  if (lower.includes('visa') || lower.includes('banque')) return 'visa';
  if (lower.includes('nita')) return 'nita';
  if (lower.includes('amana')) return 'amana';
  if (lower.includes('cash') || lower.includes('espèce') || lower.includes('espece')) return 'cash';
  return 'autre';
};

const getMonthBounds = (year, month) => {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const parseDateToYearMonth = (dateStr) => {
  if (!dateStr) return { year: new Date().getFullYear(), month: new Date().getMonth() };
  const parts = dateStr.split('-').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { year: parts[0], month: parts[1] - 1 };
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? { year: new Date().getFullYear(), month: new Date().getMonth() }
    : { year: d.getFullYear(), month: d.getMonth() };
};

const Tresorerie = ({ activeDate = localDateStr(), currentUserNom = '' }) => {
  // Navigation du mode : 'mensuel' (trésorerie indépendante par mois) ou 'global' (trésorerie générale de tous les mois)
  const [modeTresorerie, setModeTresorerie] = useState('mensuel');

  // Mois sélectionné pour la trésorerie mensuelle (null = suit activeDate)
  const [manualYearMonth, setManualYearMonth] = useState(null);

  const activeYM = useMemo(() => {
    if (manualYearMonth) return manualYearMonth;
    return parseDateToYearMonth(activeDate);
  }, [manualYearMonth, activeDate]);

  const viewYear = activeYM.year;
  const viewMonth = activeYM.month;

  // Données brutes depuis Firebase
  const [allTransactions, setAllTransactions] = useState([]);
  const [allAvances, setAllAvances] = useState([]);

  // États pour l'édition et les transferts
  const [editingAccount, setEditingAccount] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editingRealAccount, setEditingRealAccount] = useState(null);
  const [editRealValue, setEditRealValue] = useState('');
  const [showRealCard, setShowRealCard] = useState(true);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMsg, setTransferMsg] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Onglet actif : 'balances', 'synthese' (global), 'transfer', 'history', 'journalier'
  const [activeTab, setActiveTab] = useState('balances');

  // Filtres pour l'historique
  const [searchTresTerm, setSearchTresTerm] = useState('');
  const [dateDebutTres, setDateDebutTres] = useState('');
  const [dateFinTres, setDateFinTres] = useState('');

  // Accordéon jour pour le journalier
  const [expandedDay, setExpandedDay] = useState(null);

  // Écoute temps réel de Firestore
  useEffect(() => {
    const unsubTx = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const txData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllTransactions(txData);
    });

    const unsubAv = onSnapshot(collection(db, 'avances_salaires'), (snapshot) => {
      const avancesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllAvances(avancesData);
    });

    return () => {
      unsubTx();
      unsubAv();
    };
  }, []);

  // Détection dynamique de tous les mois ayant des données (pour le sélecteur et la synthèse globale)
  const availableMonths = useMemo(() => {
    const set = new Set();
    allTransactions.forEach(t => {
      if (t.date && t.date.length >= 7) set.add(t.date.substring(0, 7));
    });
    allAvances.forEach(a => {
      if (a.date && a.date.length >= 7) set.add(a.date.substring(0, 7));
    });
    // Toujours inclure le mois en cours et le mois actif
    set.add(localDateStr().substring(0, 7));
    if (activeDate) set.add(activeDate.substring(0, 7));

    const sorted = Array.from(set).sort().reverse();
    return sorted.map(ym => {
      const [y, m] = ym.split('-').map(Number);
      return {
        key: ym,
        year: y,
        month: m - 1,
        label: `${MOIS_FR[m - 1]} ${y}`
      };
    });
  }, [allTransactions, allAvances, activeDate]);

  // Date d'imputation intelligente pour les ajustements et transferts
  const getTransactionDate = () => {
    if (modeTresorerie === 'mensuel') {
      const { year: actY, month: actM } = parseDateToYearMonth(activeDate);
      if (actY === viewYear && actM === viewMonth) {
        const now = new Date();
        const d = new Date(activeDate);
        d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        return d.toISOString();
      } else {
        // Dernier jour du mois sélectionné à midi
        const endOfMonth = new Date(viewYear, viewMonth + 1, 0, 12, 0, 0);
        return endOfMonth.toISOString();
      }
    } else {
      const now = new Date();
      const d = new Date(activeDate || localDateStr());
      d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      return d.toISOString();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // CALCULS : TRÉSORERIE GLOBALE (Tous les mois cumulés)
  // ───────────────────────────────────────────────────────────────────────────
  const { globalSoldes, globalEntrees, globalSorties, totalGlobalReel, totalGlobalEntrees, totalGlobalSorties } = useMemo(() => {
    const soldes = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    const entrees = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    const sorties = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    let totEntrees = 0;
    let totSorties = 0;

    allTransactions.forEach(t => {
      const amount = Number(t.montant) || 0;
      if (t.type === 'prestation') {
        const m = getModeKey(t.modePaiement);
        soldes[m] += amount;
        entrees[m] += amount;
        totEntrees += amount;
      } else if (t.type === 'depense' && t.categoryId !== 'avance_salaire' && t.categoryNom !== 'Avance sur Salaire' && t.categorie !== 'Avance sur Salaire') {
        const m = getModeKey(t.modePaiement);
        soldes[m] -= amount;
        sorties[m] += amount;
        totSorties += amount;
      } else if (t.type === 'transfert') {
        const f = getModeKey(t.fromAccount);
        const to = getModeKey(t.toAccount);
        if (soldes[f] !== undefined) {
          soldes[f] -= amount;
          sorties[f] += amount;
        }
        if (soldes[to] !== undefined) {
          soldes[to] += amount;
          entrees[to] += amount;
        }
      } else if (t.type === 'ajustement') {
        const m = getModeKey(t.modePaiement);
        soldes[m] += amount;
        if (amount >= 0) {
          entrees[m] += amount;
          totEntrees += amount;
        } else {
          sorties[m] += Math.abs(amount);
          totSorties += Math.abs(amount);
        }
      }
    });

    allAvances.forEach(a => {
      const amount = Number(a.montant) || 0;
      const m = getModeKey(a.modePaiement);
      soldes[m] -= amount;
      sorties[m] += amount;
      totSorties += amount;
    });

    const totReel = totEntrees - totSorties;

    return {
      globalSoldes: soldes,
      globalEntrees: entrees,
      globalSorties: sorties,
      totalGlobalReel: totReel,
      totalGlobalEntrees: totEntrees,
      totalGlobalSorties: totSorties
    };
  }, [allTransactions, allAvances]);

  // ───────────────────────────────────────────────────────────────────────────
  // CALCULS : TRÉSORERIE DU MOIS SÉLECTIONNÉ (Indépendante à 100%)
  // ───────────────────────────────────────────────────────────────────────────
  const {
    moisSoldes,
    moisEntrees,
    moisSorties,
    totalMoisNet,
    totalMoisEntrees,
    totalMoisSorties,
    monthTransactions,
    monthAvances
  } = useMemo(() => {
    const { start, end } = getMonthBounds(viewYear, viewMonth);

    const txInMonth = allTransactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d >= start && d <= end;
    });

    const avInMonth = allAvances.filter(a => {
      if (!a.date) return false;
      const d = new Date(a.date);
      return d >= start && d <= end;
    });

    const soldes = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    const entrees = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    const sorties = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    let totEntrees = 0;
    let totSorties = 0;

    txInMonth.forEach(t => {
      const amount = Number(t.montant) || 0;
      if (t.type === 'prestation') {
        const m = getModeKey(t.modePaiement);
        soldes[m] += amount;
        entrees[m] += amount;
        totEntrees += amount;
      } else if (t.type === 'depense' && t.categoryId !== 'avance_salaire' && t.categoryNom !== 'Avance sur Salaire' && t.categorie !== 'Avance sur Salaire') {
        const m = getModeKey(t.modePaiement);
        soldes[m] -= amount;
        sorties[m] += amount;
        totSorties += amount;
      } else if (t.type === 'transfert') {
        const f = getModeKey(t.fromAccount);
        const to = getModeKey(t.toAccount);
        if (soldes[f] !== undefined) {
          soldes[f] -= amount;
          sorties[f] += amount;
        }
        if (soldes[to] !== undefined) {
          soldes[to] += amount;
          entrees[to] += amount;
        }
      } else if (t.type === 'ajustement') {
        const m = getModeKey(t.modePaiement);
        soldes[m] += amount;
        if (amount >= 0) {
          entrees[m] += amount;
          totEntrees += amount;
        } else {
          sorties[m] += Math.abs(amount);
          totSorties += Math.abs(amount);
        }
      }
    });

    avInMonth.forEach(a => {
      const amount = Number(a.montant) || 0;
      const m = getModeKey(a.modePaiement);
      soldes[m] -= amount;
      sorties[m] += amount;
      totSorties += amount;
    });

    const totNet = totEntrees - totSorties;

    return {
      moisSoldes: soldes,
      moisEntrees: entrees,
      moisSorties: sorties,
      totalMoisNet: totNet,
      totalMoisEntrees: totEntrees,
      totalMoisSorties: totSorties,
      monthTransactions: txInMonth,
      monthAvances: avInMonth
    };
  }, [allTransactions, allAvances, viewYear, viewMonth]);

  // ───────────────────────────────────────────────────────────────────────────
  // SYNTHÈSE MULTI-MOIS (Pour le tableau comparatif de tous les mois)
  // ───────────────────────────────────────────────────────────────────────────
  const monthlySynthesis = useMemo(() => {
    const sortedChronological = [...availableMonths].reverse();
    const result = [];
    let runningCumulative = 0;

    for (const mObj of sortedChronological) {
      const { start, end } = getMonthBounds(mObj.year, mObj.month);

      let mEntrees = 0;
      let mSorties = 0;

      for (const t of allTransactions) {
        if (!t.date) continue;
        const d = new Date(t.date);
        if (d >= start && d <= end) {
          const amount = Number(t.montant) || 0;
          if (t.type === 'prestation') {
            mEntrees += amount;
          } else if (t.type === 'depense' && t.categoryId !== 'avance_salaire' && t.categoryNom !== 'Avance sur Salaire' && t.categorie !== 'Avance sur Salaire') {
            mSorties += amount;
          } else if (t.type === 'ajustement') {
            if (amount >= 0) mEntrees += amount;
            else mSorties += Math.abs(amount);
          }
        }
      }

      for (const a of allAvances) {
        if (!a.date) continue;
        const d = new Date(a.date);
        if (d >= start && d <= end) {
          mSorties += (Number(a.montant) || 0);
        }
      }

      const mNet = mEntrees - mSorties;
      runningCumulative += mNet;

      result.push({
        ...mObj,
        entrees: mEntrees,
        sorties: mSorties,
        net: mNet,
        cumulative: runningCumulative
      });
    }

    return result.reverse(); // Afficher les mois les plus récents en premier
  }, [availableMonths, allTransactions, allAvances]);

  // ───────────────────────────────────────────────────────────────────────────
  // HISTORIQUE DES TRANSFERTS (Filtré selon le mode Mensuel vs Global)
  // ───────────────────────────────────────────────────────────────────────────
  const activeTransfersList = useMemo(() => {
    const baseList = allTransactions.filter(t => t.type === 'transfert');

    if (modeTresorerie === 'mensuel') {
      const { start, end } = getMonthBounds(viewYear, viewMonth);
      return baseList.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return baseList.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [allTransactions, modeTresorerie, viewYear, viewMonth]);

  // Navigation mois précédent / suivant
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setManualYearMonth({ year: viewYear - 1, month: 11 });
    } else {
      setManualYearMonth({ year: viewYear, month: viewMonth - 1 });
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setManualYearMonth({ year: viewYear + 1, month: 0 });
    } else {
      setManualYearMonth({ year: viewYear, month: viewMonth + 1 });
    }
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    setManualYearMonth({ year: now.getFullYear(), month: now.getMonth() });
  };

  const isCurrentMonthViewed = () => {
    const now = new Date();
    return viewYear === now.getFullYear() && viewMonth === now.getMonth();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ACTIONS : AJUSTEMENT & TRANSFERT
  // ───────────────────────────────────────────────────────────────────────────
  const handleUpdateSoldeReel = async (accountId) => {
    const newVal = Number(editRealValue);
    if (isNaN(newVal)) return;

    const oldVal = Number(globalSoldes[accountId] || 0);
    const diff = newVal - oldVal;

    if (diff !== 0) {
      const accountName = accountsList.find(a => a.id === accountId)?.label || accountId;
      const motifAjustement = `Ajustement solde réel (${accountName})`;

      await addDoc(collection(db, 'transactions'), {
        type: 'ajustement',
        montant: diff,
        modePaiement: accountId,
        motif: motifAjustement,
        date: new Date().toISOString(),
        saisieParNom: currentUserNom || 'Système'
      });

      await logEvent('TRESORERIE_UPDATE', `${motifAjustement}. Différence: ${diff > 0 ? '+' : ''}${diff} FCFA (Nouveau solde réel: ${newVal.toLocaleString('fr-FR')} FCFA)`);
      setShowSuccess(true);
    }

    setEditingRealAccount(null);
    setEditRealValue('');
  };

  const handleUpdateSolde = async (accountId) => {
    const newVal = Number(editValue);
    if (isNaN(newVal)) return;

    // En mode mensuel, l'ajustement est calculé par rapport au solde net de ce mois
    // En mode global, par rapport au solde cumulé
    const currentSoldes = modeTresorerie === 'mensuel' ? moisSoldes : globalSoldes;
    const oldVal = Number(currentSoldes[accountId] || 0);
    const diff = newVal - oldVal;

    if (diff !== 0) {
      const targetDate = getTransactionDate();
      const accountName = accountsList.find(a => a.id === accountId)?.label || accountId;
      const monthLabel = `${MOIS_FR[viewMonth]} ${viewYear}`;
      const motifAjustement = modeTresorerie === 'mensuel'
        ? `Ajustement trésorerie (${accountName}) — ${monthLabel}`
        : `Ajustement global trésorerie (${accountName})`;

      await addDoc(collection(db, 'transactions'), {
        type: 'ajustement',
        montant: diff,
        modePaiement: accountId,
        motif: motifAjustement,
        date: targetDate,
        saisieParNom: currentUserNom || 'Système'
      });

      await logEvent('TRESORERIE_UPDATE', `${motifAjustement}. Différence: ${diff > 0 ? '+' : ''}${diff} FCFA`);
    }

    setEditingAccount(null);
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferMsg(null);
    if (!transferFrom || !transferTo || transferFrom === transferTo) {
      setTransferMsg({ type: 'error', text: 'Veuillez sélectionner deux comptes différents.' });
      return;
    }
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) {
      setTransferMsg({ type: 'error', text: 'Montant invalide.' });
      return;
    }

    // Vérification du solde disponible (on vérifie la trésorerie réelle globale disponible pour ne pas bloquer les virements réels)
    if (Number(globalSoldes[transferFrom] || 0) < amount) {
      const sourceLabel = accountsList.find(a => a.id === transferFrom)?.label || transferFrom;
      setTransferMsg({
        type: 'error',
        text: `Solde insuffisant sur le compte ${sourceLabel} (Disponible global: ${Number(globalSoldes[transferFrom] || 0).toLocaleString('fr-FR')} F).`
      });
      return;
    }

    try {
      const accFrom = accountsList.find(a => a.id === transferFrom)?.label || transferFrom;
      const accTo = accountsList.find(a => a.id === transferTo)?.label || transferTo;
      const targetDate = getTransactionDate();
      const monthLabel = `${MOIS_FR[viewMonth]} ${viewYear}`;

      await addDoc(collection(db, 'transactions'), {
        type: 'transfert',
        montant: amount,
        motif: `Transfert de ${accFrom} vers ${accTo} (${modeTresorerie === 'mensuel' ? monthLabel : 'Trésorerie'})`,
        fromAccount: transferFrom,
        toAccount: transferTo,
        date: targetDate,
        saisieParNom: currentUserNom || 'Système'
      });

      await logEvent('TRESORERIE_TRANSFERT', `Transfert de ${amount} FCFA de [${accFrom}] vers [${accTo}]`);
      setTransferAmount('');
      setTransferFrom('');
      setTransferTo('');
      setShowSuccess(true);
      setTransferMsg(null);
    } catch {
      setTransferMsg({ type: 'error', text: 'Erreur lors du transfert.' });
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // JOURNALIER (Génération des lignes journalières)
  // ───────────────────────────────────────────────────────────────────────────
  const dailyJournal = useMemo(() => {
    const isMensuel = modeTresorerie === 'mensuel';

    const relevantTx = isMensuel
      ? monthTransactions
      : allTransactions;

    const relevantAv = isMensuel
      ? monthAvances
      : allAvances;

    const items = [];
    const totalsByChannel = {
      cash: { in: 0, out: 0 },
      nita: { in: 0, out: 0 },
      amana: { in: 0, out: 0 },
      visa: { in: 0, out: 0 },
      autre: { in: 0, out: 0 }
    };

    relevantTx.forEach(t => {
      if (t.categoryId === 'avance_salaire' || t.categoryNom === 'Avance sur Salaire' || t.categorie === 'Avance sur Salaire') return;
      const dStr = (t.date || '').substring(0, 10);
      if (!dStr) return;

      if (t.type === 'transfert') {
        items.push({
          date: dStr,
          type: 'transfert',
          montant: Number(t.montant) || 0,
          from: getModeKey(t.fromAccount),
          to: getModeKey(t.toAccount)
        });
      } else {
        items.push({
          date: dStr,
          type: t.type,
          categorie: t.categorie || 'Autre',
          montant: Number(t.montant) || 0,
          motif: t.motif,
          mode: getModeKey(t.modePaiement)
        });
      }
    });

    relevantAv.forEach(a => {
      const dStr = (a.date || '').substring(0, 10);
      if (!dStr) return;
      items.push({
        date: dStr,
        type: 'avance',
        categorie: 'Avances sur salaires',
        montant: Number(a.montant) || 0,
        motif: a.motif,
        mode: getModeKey(a.modePaiement)
      });
    });

    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.date]) {
        grouped[item.date] = {
          entrees: 0,
          sorties: 0,
          details: { entrees: {}, sorties: {} },
          modes: {
            cash: { entrees: 0, sorties: 0 },
            nita: { entrees: 0, sorties: 0 },
            amana: { entrees: 0, sorties: 0 },
            visa: { entrees: 0, sorties: 0 },
            autre: { entrees: 0, sorties: 0 }
          }
        };
      }

      const g = grouped[item.date];

      if (item.type === 'transfert') {
        if (g.modes[item.from]) g.modes[item.from].sorties += item.montant;
        if (g.modes[item.to]) g.modes[item.to].entrees += item.montant;
      } else {
        const mKey = item.mode || 'cash';
        if (!g.modes[mKey]) g.modes[mKey] = { entrees: 0, sorties: 0 };

        if (item.type === 'prestation') {
          g.entrees += item.montant;
          g.modes[mKey].entrees += item.montant;
          totalsByChannel[mKey].in += item.montant;
          g.details.entrees['Prestations'] = (g.details.entrees['Prestations'] || 0) + item.montant;
        } else if (item.type === 'depense') {
          g.sorties += item.montant;
          g.modes[mKey].sorties += item.montant;
          totalsByChannel[mKey].out += item.montant;
          const cat = item.categorie || 'Dépenses diverses';
          g.details.sorties[cat] = (g.details.sorties[cat] || 0) + item.montant;
        } else if (item.type === 'avance') {
          g.sorties += item.montant;
          g.modes[mKey].sorties += item.montant;
          totalsByChannel[mKey].out += item.montant;
          g.details.sorties['Avances sur salaires'] = (g.details.sorties['Avances sur salaires'] || 0) + item.montant;
        } else if (item.type === 'ajustement') {
          if (item.montant >= 0) {
            g.entrees += item.montant;
            g.modes[mKey].entrees += item.montant;
            totalsByChannel[mKey].in += item.montant;
            g.details.entrees['Ajustements (Ajout)'] = (g.details.entrees['Ajustements (Ajout)'] || 0) + item.montant;
          } else {
            const absM = Math.abs(item.montant);
            g.sorties += absM;
            g.modes[mKey].sorties += absM;
            totalsByChannel[mKey].out += absM;
            g.details.sorties['Ajustements (Retrait)'] = (g.details.sorties['Ajustements (Retrait)'] || 0) + absM;
          }
        }
      }
    });

    const sortedDates = Object.keys(grouped).sort();

    // En mode mensuel : début du mois à 0 F (trésorerie indépendante du mois, pas de report antérieur)
    // En mode global : cumul progressif continu depuis le 1er jour
    let runningBalanceTotal = 0;
    const runningBalancesModes = { cash: 0, nita: 0, amana: 0, visa: 0, autre: 0 };
    const historyList = [];

    sortedDates.forEach(dStr => {
      const dayData = grouped[dStr];
      const ouverture = runningBalanceTotal;
      runningBalanceTotal = ouverture + dayData.entrees - dayData.sorties;

      const endBalances = {};
      accountsList.forEach(acc => {
        const id = acc.id;
        runningBalancesModes[id] = runningBalancesModes[id] + dayData.modes[id].entrees - dayData.modes[id].sorties;
        endBalances[id] = runningBalancesModes[id];
      });

      historyList.push({
        date: dStr,
        ouverture,
        entrees: dayData.entrees,
        sorties: dayData.sorties,
        cloture: runningBalanceTotal,
        details: dayData.details,
        modes: dayData.modes,
        endBalances
      });
    });

    historyList.reverse();

    return {
      historyList,
      totalsByChannel
    };
  }, [modeTresorerie, monthTransactions, monthAvances, allTransactions, allAvances]);

  // Données de soldes actuelles selon le mode
  const currentSoldes = modeTresorerie === 'mensuel' ? moisSoldes : globalSoldes;
  const currentEntrees = modeTresorerie === 'mensuel' ? moisEntrees : globalEntrees;
  const currentSorties = modeTresorerie === 'mensuel' ? moisSorties : globalSorties;
  const currentNetTotal = modeTresorerie === 'mensuel' ? totalMoisNet : totalGlobalReel;

  return (
    <div className="view-container">
      {showSuccess && <SuccessModal message="Opération effectuée avec succès !" onClose={() => setShowSuccess(false)} />}

      {/* ── SÉLECTEUR DE MODE : MENSUEL VS GLOBAL ───────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        backgroundColor: 'var(--bg-input)',
        padding: '6px',
        borderRadius: '14px'
      }}>
        <button
          onClick={() => { setModeTresorerie('mensuel'); setActiveTab('balances'); }}
          className="btn"
          style={{
            flex: 1,
            minWidth: '220px',
            minHeight: '48px',
            borderRadius: '10px',
            backgroundColor: modeTresorerie === 'mensuel' ? 'var(--btn-primary-bg)' : 'transparent',
            color: modeTresorerie === 'mensuel' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: modeTresorerie === 'mensuel' ? '1px solid var(--btn-primary-border)' : 'none',
            fontWeight: '700',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: modeTresorerie === 'mensuel' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
          }}
        >
          <CalendarDays size={19} /> Trésorerie Mensuelle (Par Mois)
        </button>

        <button
          onClick={() => { setModeTresorerie('global'); setActiveTab('balances'); }}
          className="btn"
          style={{
            flex: 1,
            minWidth: '220px',
            minHeight: '48px',
            borderRadius: '10px',
            backgroundColor: modeTresorerie === 'global' ? 'var(--btn-primary-bg)' : 'transparent',
            color: modeTresorerie === 'global' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: modeTresorerie === 'global' ? '1px solid var(--btn-primary-border)' : 'none',
            fontWeight: '700',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: modeTresorerie === 'global' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
          }}
        >
          <Globe size={19} /> Trésorerie Globale (Tous les Mois)
        </button>
      </div>

      {/* ── BARRE DE SÉLECTION DU MOIS (Si mode Mensuel) ────────────────────── */}
      {modeTresorerie === 'mensuel' && (
        <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={goToPrevMonth}
                className="btn"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: '10px' }}
                title="Mois précédent"
              >
                <ChevronLeft size={20} />
              </button>

              <div style={{ position: 'relative' }}>
                <select
                  value={`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    setManualYearMonth({ year: y, month: m - 1 });
                  }}
                  className="input-control"
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: '800',
                    margin: 0,
                    minHeight: '46px',
                    paddingRight: '36px',
                    cursor: 'pointer'
                  }}
                >
                  {availableMonths.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={goToNextMonth}
                className="btn"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: '10px' }}
                title="Mois suivant"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!isCurrentMonthViewed() && (
                <button
                  onClick={goToCurrentMonth}
                  className="btn"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RotateCcw size={15} /> Mois actuel
                </button>
              )}

              <span style={{
                fontSize: '0.8rem',
                backgroundColor: 'rgba(59,130,246,0.12)',
                color: 'var(--accent-color)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle size={14} /> Mois indépendant
              </span>
            </div>
          </div>

          <div style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Trésorerie exclusive de <strong>{MOIS_FR[viewMonth]} {viewYear}</strong>. Les opérations et reliquats des autres mois sont isolés.
          </div>
        </div>
      )}

      {/* ── BANNIÈRE RÉSUMÉ GLOBALE (Si mode Global) ────────────────────────── */}
      {modeTresorerie === 'global' && (
        <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={22} color="var(--accent-color)" /> Trésorerie Globale du Salon
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Vue d'ensemble de tous les flux financiers enregistrés depuis le début de l'activité.
              </div>
            </div>
            <button
              onClick={() => setActiveTab('synthese')}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Layers size={16} /> Voir la synthèse par mois
            </button>
          </div>
        </div>
      )}

      {/* ── CARTES KPI (Trésorerie nette, Entrées, Sorties) ─────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        {/* CARTE TRÉSORERIE NETTE */}
        <div className="card" style={{
          marginBottom: 0,
          backgroundColor: currentNetTotal >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${currentNetTotal >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>
              {modeTresorerie === 'mensuel' ? `Trésorerie Nette — ${MOIS_FR[viewMonth]}` : 'Solde Global Réel'}
            </span>
            <Wallet size={20} color={currentNetTotal >= 0 ? 'var(--success)' : 'var(--danger)'} />
          </div>
          <div style={{
            fontSize: '1.9rem',
            fontWeight: '800',
            color: currentNetTotal >= 0 ? 'var(--success)' : 'var(--danger)',
            marginBottom: '4px'
          }}>
            {currentNetTotal >= 0 ? '+' : ''}{currentNetTotal.toLocaleString('fr-FR')} FCFA
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {modeTresorerie === 'mensuel'
              ? 'Résultat net propre à ce mois (Entrées − Sorties)'
              : 'Trésorerie globale disponible cumulée'}
          </div>
        </div>

        {/* CARTE TOTAL ENTRÉES */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>
              {modeTresorerie === 'mensuel' ? `Entrées du Mois` : 'Total Entrées Historiques'}
            </span>
            <TrendingUp size={20} color="var(--success)" />
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '800', color: 'var(--success)', marginBottom: '4px' }}>
            +{(modeTresorerie === 'mensuel' ? totalMoisEntrees : totalGlobalEntrees).toLocaleString('fr-FR')} FCFA
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Prestations encaissées & ajustements positifs
          </div>
        </div>

        {/* CARTE TOTAL SORTIES */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>
              {modeTresorerie === 'mensuel' ? `Sorties du Mois` : 'Total Sorties Historiques'}
            </span>
            <TrendingDown size={20} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '800', color: 'var(--danger)', marginBottom: '4px' }}>
            -{(modeTresorerie === 'mensuel' ? totalMoisSorties : totalGlobalSorties).toLocaleString('fr-FR')} FCFA
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Dépenses, avances salaires & décaissements
          </div>
        </div>
      </div>

      {/* ── BANDEAU SOLDE RÉEL ACTUEL (TOUJOURS VISIBLE DANS TOUS LES MODES) ── */}
      <div className="card" style={{
        marginBottom: '20px',
        padding: '16px 20px',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.06) 100%)',
        border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: '14px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              backgroundColor: 'var(--success)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Wallet size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Solde Actuel Réel en Caisse & Comptes
                <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                  En direct
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Liquidités réelles immédiatement disponibles (CASH, NITA, AMANA, VISA, AUTRE)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Total Réel Disponible
              </div>
              <div style={{
                fontSize: '1.6rem',
                fontWeight: '900',
                color: totalGlobalReel >= 0 ? 'var(--success)' : 'var(--danger)'
              }}>
                {totalGlobalReel >= 0 ? '+' : ''}{totalGlobalReel.toLocaleString('fr-FR')} FCFA
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setActiveTab('solde_reel')}
                className="btn btn-primary"
                style={{
                  fontSize: '0.82rem',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Wallet size={15} /> Gérer les soldes réels
              </button>

              <button
                onClick={() => setShowRealCard(!showRealCard)}
                className="btn"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title={showRealCard ? 'Masquer la grille' : 'Afficher la grille'}
              >
                {showRealCard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showRealCard ? 'Masquer' : 'Aperçu'}
              </button>
            </div>
          </div>
        </div>

        {showRealCard && (
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '10px'
          }}>
            {accountsList.map(acc => {
              const sReal = Number(globalSoldes[acc.id]) || 0;
              return (
                <div
                  key={acc.id}
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {getAccountIcon(acc.id, 16)}
                      <span style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        {acc.label}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '800',
                    color: sReal >= 0 ? 'var(--text-main)' : 'var(--danger)'
                  }}>
                    {sReal.toLocaleString('fr-FR')} FCFA
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ONGLETS DE NAVIGATION DE LA PAGE ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('balances')}
          className={`btn ${activeTab === 'balances' ? 'btn-primary' : ''}`}
          style={{
            flex: 1, minWidth: '140px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'balances' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
            color: activeTab === 'balances' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: activeTab === 'balances' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
            fontWeight: 'bold',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <CalendarDays size={18} /> {modeTresorerie === 'mensuel' ? `Soldes ${MOIS_FR[viewMonth]}` : 'Soldes Globaux'}
        </button>

        <button
          onClick={() => setActiveTab('solde_reel')}
          className={`btn ${activeTab === 'solde_reel' ? 'btn-primary' : ''}`}
          style={{
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'solde_reel' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
            color: activeTab === 'solde_reel' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: activeTab === 'solde_reel' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
            fontWeight: 'bold',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <Wallet size={18} /> Solde Actuel Réel
        </button>

        {modeTresorerie === 'global' && (
          <button
            onClick={() => setActiveTab('synthese')}
            className={`btn ${activeTab === 'synthese' ? 'btn-primary' : ''}`}
            style={{
              flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
              backgroundColor: activeTab === 'synthese' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
              color: activeTab === 'synthese' ? 'var(--btn-primary-text)' : 'var(--text-main)',
              border: activeTab === 'synthese' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
              fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <Layers size={18} /> Synthèse par Mois
          </button>
        )}

        <button
          onClick={() => setActiveTab('transfer')}
          className={`btn ${activeTab === 'transfer' ? 'btn-primary' : ''}`}
          style={{
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'transfer' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
            color: activeTab === 'transfer' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: activeTab === 'transfer' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
            fontWeight: 'bold',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <ArrowRightLeft size={18} /> Effectuer Transfert
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`btn ${activeTab === 'history' ? 'btn-primary' : ''}`}
          style={{
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'history' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
            color: activeTab === 'history' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: activeTab === 'history' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
            fontWeight: 'bold',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <CheckCircle size={18} /> Historique Transferts
        </button>

        <button
          onClick={() => setActiveTab('journalier')}
          className={`btn ${activeTab === 'journalier' ? 'btn-primary' : ''}`}
          style={{
            flex: 1, minWidth: '150px', minHeight: '48px', borderRadius: '12px',
            backgroundColor: activeTab === 'journalier' ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
            color: activeTab === 'journalier' ? 'var(--btn-primary-text)' : 'var(--text-main)',
            border: activeTab === 'journalier' ? '1px solid var(--btn-primary-border)' : '1px solid var(--border-color)',
            fontWeight: 'bold',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}
        >
          <Calendar size={18} /> {modeTresorerie === 'mensuel' ? 'Journalier du Mois' : 'Journalier Global'}
        </button>
      </div>

      {/* ── CONTENU DES ONGLETS ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── ONGLET DÉDIÉ : SOLDE ACTUEL RÉEL (TOUS COMPTES) ──────────────────── */}
        {activeTab === 'solde_reel' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px',
                  backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Wallet size={24} />
                </div>
                <div>
                  <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none', fontSize: '1.25rem' }}>
                    Solde Actuel Réel — Caisse & Tous les Comptes
                  </h2>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Vue en temps réel sur les liquidités réellement disponibles dans chaque compte (CASH, NITA, AMANA, VISA, AUTRE).
                  </div>
                </div>
              </div>

              <div style={{
                padding: '10px 18px',
                borderRadius: '12px',
                backgroundColor: totalGlobalReel >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${totalGlobalReel >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                textAlign: 'right'
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Total Réel Disponible Tous Comptes
                </div>
                <div style={{
                  fontSize: '1.8rem',
                  fontWeight: '900',
                  color: totalGlobalReel >= 0 ? 'var(--success)' : 'var(--danger)'
                }}>
                  {totalGlobalReel >= 0 ? '+' : ''}{totalGlobalReel.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
            </div>

            {/* Grille détaillée des comptes réels */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {accountsList.map(acc => {
                const sReal = Number(globalSoldes[acc.id]) || 0;
                const ent = Number(globalEntrees[acc.id]) || 0;
                const sor = Number(globalSorties[acc.id]) || 0;
                const isEditing = editingRealAccount === acc.id;

                return (
                  <div
                    key={acc.id}
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: '14px',
                      padding: '18px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '34px', height: '34px', borderRadius: '8px',
                            backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {getAccountIcon(acc.id, 18)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                              {acc.label}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {acc.sub}
                            </div>
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.72rem',
                          padding: '3px 8px',
                          borderRadius: '10px',
                          backgroundColor: sReal >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: sReal >= 0 ? 'var(--success)' : 'var(--danger)',
                          fontWeight: '700'
                        }}>
                          {sReal >= 0 ? 'Solde Positif' : 'Solde Négatif'}
                        </span>
                      </div>

                      {isEditing ? (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Définir le solde réel exact en FCFA :
                          </label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              className="input-control"
                              style={{ margin: 0, padding: '8px 12px', minHeight: '42px', fontSize: '1.1rem', fontWeight: 'bold' }}
                              value={editRealValue}
                              onChange={e => setEditRealValue(e.target.value)}
                              placeholder="Nouveau solde réel"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdateSoldeReel(acc.id)}
                              className="btn btn-success"
                              style={{ minHeight: '42px', padding: '0 14px' }}
                              title="Valider l'ajustement du solde réel"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => { setEditingRealAccount(null); setEditRealValue(''); }}
                              className="btn"
                              style={{ minHeight: '42px', padding: '0 12px', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                            Solde Actuel Réel Disponible
                          </div>
                          <div style={{
                            fontSize: '1.85rem',
                            fontWeight: '900',
                            color: sReal >= 0 ? 'var(--text-main)' : 'var(--danger)',
                            marginTop: '2px'
                          }}>
                            {sReal.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                      )}

                      {/* Flux historiques */}
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-main)',
                        fontSize: '0.8rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Total Encaissé (Historique)</span>
                          <span style={{ fontWeight: '700', color: 'var(--success)' }}>+{ent.toLocaleString('fr-FR')} F</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Total Décaissé (Historique)</span>
                          <span style={{ fontWeight: '700', color: 'var(--danger)' }}>-{sor.toLocaleString('fr-FR')} F</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingRealAccount(acc.id);
                            setEditRealValue(sReal);
                          }}
                          className="btn"
                          style={{
                            flex: 1,
                            minHeight: '38px',
                            fontSize: '0.82rem',
                            backgroundColor: 'var(--bg-main)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <Edit2 size={14} /> Ajuster solde réel
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setTransferFrom(acc.id);
                          setActiveTab('transfer');
                        }}
                        className="btn"
                        style={{
                          minHeight: '38px',
                          fontSize: '0.82rem',
                          backgroundColor: 'rgba(59,130,246,0.1)',
                          color: 'var(--accent-color)',
                          border: '1px solid rgba(59,130,246,0.25)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '0 12px'
                        }}
                        title="Transférer depuis ce compte"
                      >
                        <ArrowRightLeft size={14} /> Transférer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 1. ONGLET : SOLDES DES COMPTES */}
        {activeTab === 'balances' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Wallet size={24} color="var(--accent-color)" />
                <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                  {modeTresorerie === 'mensuel'
                    ? `Soldes & Flux — ${MOIS_FR[viewMonth]} ${viewYear}`
                    : 'Soldes Globaux des Comptes'}
                </h2>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {modeTresorerie === 'mensuel'
                  ? 'Trésorerie calculée uniquement sur ce mois'
                  : 'Trésorerie cumulée sur tous les mois'}
              </span>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-input)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {modeTresorerie === 'mensuel' ? `Solde Net Réalisé (${MOIS_FR[viewMonth]})` : 'Solde Réel Cumulé Tous Comptes'}
              </div>
              <div style={{
                fontSize: '2.2rem',
                fontWeight: '800',
                color: currentNetTotal >= 0 ? 'var(--accent-color)' : 'var(--danger)'
              }}>
                {currentNetTotal >= 0 ? '+' : ''}{currentNetTotal.toLocaleString('fr-FR')} FCFA
              </div>
            </div>

            <div className="list-container">
              {accountsList.map(acc => {
                const sCurrent = Number(currentSoldes[acc.id]) || 0;
                const sReal = Number(globalSoldes[acc.id]) || 0;
                const ent = Number(currentEntrees[acc.id]) || 0;
                const sor = Number(currentSorties[acc.id]) || 0;

                return (
                  <div key={acc.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '16px',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '8px',
                        backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {getAccountIcon(acc.id, 18)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: '3px' }}>
                          {acc.label}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                          <span>Entrées : <strong style={{ color: 'var(--success)' }}>+{ent.toLocaleString('fr-FR')} F</strong></span>
                          <span>Sorties : <strong style={{ color: 'var(--danger)' }}>-{sor.toLocaleString('fr-FR')} F</strong></span>
                          {modeTresorerie === 'mensuel' && (
                            <span style={{ color: 'var(--accent-color)', fontWeight: '600' }}>
                              Solde réel actuel : <strong>{sReal.toLocaleString('fr-FR')} F</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {editingAccount === acc.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          className="input-control"
                          style={{ width: '130px', padding: '10px', minHeight: '44px', margin: 0 }}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          placeholder="Nouveau solde"
                        />
                        <button
                          onClick={() => handleUpdateSolde(acc.id)}
                          className="btn btn-success"
                          style={{ minHeight: '44px' }}
                          title="Valider l'ajustement"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          onClick={() => setEditingAccount(null)}
                          className="btn"
                          style={{ minHeight: '44px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontWeight: '800',
                            fontSize: '1.15rem',
                            color: sCurrent >= 0 ? 'var(--text-main)' : 'var(--danger)'
                          }}>
                            {sCurrent >= 0 ? '' : ''}{sCurrent.toLocaleString('fr-FR')} FCFA
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {modeTresorerie === 'mensuel' ? 'Flux net du mois' : 'Solde cumulé'}
                          </div>
                        </div>
                        <button
                          onClick={() => { setEditingAccount(acc.id); setEditValue(sCurrent); }}
                          className="btn"
                          style={{
                            backgroundColor: 'transparent',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            minHeight: '40px',
                            padding: '0 12px',
                            borderRadius: '8px',
                            fontSize: '0.85rem'
                          }}
                          title="Ajuster le solde"
                        >
                          <Edit2 size={15} style={{ marginRight: '6px' }} /> Ajuster
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. ONGLET : SYNTHÈSE MULTI-MOIS (Tableau comparatif de tous les mois) */}
        {activeTab === 'synthese' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Layers size={22} color="var(--accent-color)" />
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                Synthèse Mensuelle du Salon (Tous les Mois)
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Chaque mois possède sa trésorerie propre et indépendante. Vous pouvez consulter les résultats de chaque période ou basculer dessus en un clic.
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 10px' }}>Mois</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Entrées (Recettes)</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Sorties (Dépenses)</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Trésorerie Nette</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Cumul Salon</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySynthesis.map(m => (
                    <tr
                      key={m.key}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: (viewYear === m.year && viewMonth === m.month && modeTresorerie === 'mensuel')
                          ? 'rgba(59,130,246,0.06)'
                          : 'transparent'
                      }}
                    >
                      <td style={{ padding: '14px 10px', fontWeight: '700', color: 'var(--text-main)' }}>
                        {m.label}
                        {m.year === new Date().getFullYear() && m.month === new Date().getMonth() && (
                          <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>
                            En cours
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--success)', fontWeight: '600' }}>
                        +{m.entrees.toLocaleString('fr-FR')} F
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--danger)', fontWeight: '600' }}>
                        -{m.sorties.toLocaleString('fr-FR')} F
                      </td>
                      <td style={{
                        padding: '14px 10px',
                        textAlign: 'right',
                        fontWeight: '800',
                        color: m.net >= 0 ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {m.net >= 0 ? '+' : ''}{m.net.toLocaleString('fr-FR')} F
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'right', fontWeight: '700', color: 'var(--text-main)' }}>
                        {m.cumulative.toLocaleString('fr-FR')} F
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setManualYearMonth({ year: m.year, month: m.month });
                            setModeTresorerie('mensuel');
                            setActiveTab('balances');
                          }}
                          className="btn"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--accent-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px'
                          }}
                        >
                          Voir ce mois
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ONGLET : EFFECTUER TRANSFERT */}
        {activeTab === 'transfer' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <ArrowRightLeft size={20} color="var(--accent-color)" />
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                Transfert Interne de Fonds
              </h2>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Déplacer des fonds d'un canal vers un autre (ex: virement du Cash vers Nita ou la banque).
              {modeTresorerie === 'mensuel' && (
                <span style={{ display: 'block', marginTop: '4px', color: 'var(--accent-color)' }}>
                  Imputation sur la trésorerie de : <strong>{MOIS_FR[viewMonth]} {viewYear}</strong>.
                </span>
              )}
            </p>

            {transferMsg && (
              <div style={{
                padding: '14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem',
                backgroundColor: transferMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: transferMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${transferMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
              }}>
                {transferMsg.text}
              </div>
            )}

            <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px', fontWeight: '600' }}>
                  Compte Source (Débiter)
                </label>
                <select
                  className="input-control"
                  style={{ minHeight: '48px', fontSize: '1rem' }}
                  value={transferFrom}
                  onChange={e => setTransferFrom(e.target.value)}
                  required
                >
                  <option value="">-- Sélectionner le compte source --</option>
                  {accountsList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.label} (Dispo global : {Number(globalSoldes[a.id] || 0).toLocaleString('fr-FR')} F)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px', fontWeight: '600' }}>
                  Compte Destination (Créditer)
                </label>
                <select
                  className="input-control"
                  style={{ minHeight: '48px', fontSize: '1rem' }}
                  value={transferTo}
                  onChange={e => setTransferTo(e.target.value)}
                  required
                >
                  <option value="">-- Sélectionner le compte de destination --</option>
                  {accountsList.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.9rem', marginBottom: '8px', fontWeight: '600' }}>
                  Montant à transférer (FCFA)
                </label>
                <input
                  type="number"
                  className="input-control"
                  style={{ minHeight: '48px', fontSize: '1.1rem', fontWeight: 'bold' }}
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  required
                  placeholder="ex: 25000"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ minHeight: '52px', fontSize: '1.05rem', borderRadius: '12px', marginTop: '10px' }}
              >
                <ArrowRightLeft size={18} style={{ marginRight: '8px' }} /> Valider le transfert
              </button>
            </form>
          </div>
        )}

        {/* 4. ONGLET : HISTORIQUE DES TRANSFERTS */}
        {activeTab === 'history' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                {modeTresorerie === 'mensuel'
                  ? `Historique des Transferts — ${MOIS_FR[viewMonth]} ${viewYear}`
                  : 'Historique Global des Transferts'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {activeTransfersList.length} transfert{activeTransfersList.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '15px' }} />
                <input
                  type="text"
                  className="input-control"
                  style={{ paddingLeft: '40px', width: '100%', minHeight: '46px', margin: 0 }}
                  placeholder="Rechercher compte, motif, auteur..."
                  value={searchTresTerm}
                  onChange={e => setSearchTresTerm(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '3px' }}>Du</label>
                  <input
                    type="date"
                    className="input-control"
                    style={{ margin: 0, minHeight: '46px', padding: '6px 10px' }}
                    value={dateDebutTres}
                    onChange={e => setDateDebutTres(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '3px' }}>Au</label>
                  <input
                    type="date"
                    className="input-control"
                    style={{ margin: 0, minHeight: '46px', padding: '6px 10px' }}
                    value={dateFinTres}
                    onChange={e => setDateFinTres(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(() => {
                const filtered = activeTransfersList.filter(tx => {
                  const dStr = (tx.date || '').substring(0, 10);
                  if (dateDebutTres && dStr < dateDebutTres) return false;
                  if (dateFinTres && dStr > dateFinTres) return false;
                  if (searchTresTerm) {
                    const st = searchTresTerm.toLowerCase();
                    const accFrom = accountsList.find(a => a.id === tx.fromAccount)?.label || tx.fromAccount || '';
                    const accTo = accountsList.find(a => a.id === tx.toAccount)?.label || tx.toAccount || '';
                    return accFrom.toLowerCase().includes(st) ||
                           accTo.toLowerCase().includes(st) ||
                           (tx.motif || '').toLowerCase().includes(st) ||
                           (tx.saisieParNom || '').toLowerCase().includes(st);
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '25px' }}>
                      Aucun transfert enregistré pour cette période.
                    </p>
                  );
                }

                return filtered.map(tx => {
                  const d = new Date(tx.date);
                  const accFromLabel = accountsList.find(a => a.id === tx.fromAccount)?.label || tx.fromAccount;
                  const accToLabel = accountsList.find(a => a.id === tx.toAccount)?.label || tx.toAccount;

                  return (
                    <div key={tx.id} style={{
                      backgroundColor: 'var(--bg-input)',
                      padding: '16px',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {d.toLocaleDateString('fr-FR')} {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--accent-color)' }}>
                          {Number(tx.montant).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem' }}>
                        <span style={{ fontWeight: '700' }}>{accFromLabel}</span>
                        <ArrowRightLeft size={15} color="var(--text-muted)" />
                        <span style={{ fontWeight: '700' }}>{accToLabel}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {tx.motif}
                        {tx.saisieParNom && (
                          <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>— Par : {tx.saisieParNom}</span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* 5. ONGLET : JOURNALIER DE TRÉSORERIE */}
        {activeTab === 'journalier' && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={24} color="var(--accent-color)" />
                <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                  {modeTresorerie === 'mensuel'
                    ? `Journal de Trésorerie — ${MOIS_FR[viewMonth]} ${viewYear}`
                    : 'Journal Global de Trésorerie'}
                </h2>
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {modeTresorerie === 'mensuel'
                  ? 'Suivi jour par jour du mois (Ouverture à 0 F)'
                  : 'Suivi continu cumulé depuis le début'}
              </span>
            </div>

            {/* SOUS-TOTAUX PAR CANAL */}
            <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Flux par canal de paiement ({modeTresorerie === 'mensuel' ? MOIS_FR[viewMonth] : 'Global'})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                {accountsList.map(acc => {
                  const id = acc.id;
                  const tIn = dailyJournal.totalsByChannel[id].in;
                  const tOut = dailyJournal.totalsByChannel[id].out;
                  const net = tIn - tOut;
                  if (tIn === 0 && tOut === 0) return null;
                  return (
                    <div key={id} style={{ backgroundColor: 'var(--bg-main)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '0.9rem' }}>{acc.label}</div>
                      <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Encaissé</span>
                        <span style={{ color: 'var(--success)', fontWeight: '600' }}>+{tIn.toLocaleString('fr-FR')}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Décaissé</span>
                        <span style={{ color: 'var(--danger)', fontWeight: '600' }}>-{tOut.toLocaleString('fr-FR')}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '4px', fontWeight: 'bold' }}>
                        <span>Net</span>
                        <span style={{ color: net >= 0 ? 'var(--accent-color)' : 'var(--danger)' }}>
                          {net >= 0 ? '+' : ''}{net.toLocaleString('fr-FR')} F
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LISTE DES JOURS */}
            <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {dailyJournal.historyList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '25px' }}>
                  Aucun mouvement enregistré pour cette période.
                </p>
              ) : (
                dailyJournal.historyList.map(day => {
                  const d = new Date(day.date + 'T12:00:00');
                  const isExpanded = expandedDay === day.date;

                  return (
                    <div key={day.date} style={{
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: isExpanded ? '1px solid var(--accent-color)' : '1px solid transparent',
                      transition: 'border 0.2s ease'
                    }}>
                      <div
                        onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                        style={{ padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                          <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '1rem', textTransform: 'capitalize' }}>
                            {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                          <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                            {isExpanded ? 'Fermer' : 'Détails'}
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                          <div>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>Ouverture</div>
                            <div style={{ fontWeight: '600' }}>{day.ouverture.toLocaleString('fr-FR')} F</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>Entrées</div>
                            <div style={{ fontWeight: '700', color: 'var(--success)' }}>+{day.entrees.toLocaleString('fr-FR')} F</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>Sorties</div>
                            <div style={{ fontWeight: '700', color: 'var(--danger)' }}>-{day.sorties.toLocaleString('fr-FR')} F</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>Clôture (Net)</div>
                            <div style={{
                              fontWeight: '800',
                              fontSize: '1.05rem',
                              color: day.cloture >= 0 ? 'var(--accent-color)' : 'var(--danger)'
                            }}>
                              {day.cloture.toLocaleString('fr-FR')} F
                            </div>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)' }}>
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '10px' }}>
                              Soldes de fin de journée par caisse
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {accountsList.map(acc => {
                                const bal = day.endBalances[acc.id];
                                if (!bal && day.modes[acc.id].entrees === 0 && day.modes[acc.id].sorties === 0) return null;
                                return (
                                  <div key={acc.id} style={{
                                    padding: '6px 12px',
                                    backgroundColor: 'var(--bg-input)',
                                    borderRadius: '6px',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center'
                                  }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{acc.label}:</span>
                                    <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{bal.toLocaleString('fr-FR')} F</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '12px' }}>
                            Répartition du jour
                          </div>
                          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            {/* ENTRÉES */}
                            <div style={{ flex: 1, minWidth: '180px' }}>
                              <div style={{ color: 'var(--success)', fontWeight: '700', marginBottom: '8px', borderBottom: '1px solid rgba(16,185,129,0.2)', paddingBottom: '4px', fontSize: '0.85rem' }}>
                                Flux Entrants
                              </div>
                              {Object.keys(day.details.entrees).length > 0 ? (
                                Object.entries(day.details.entrees).map(([cat, montant]) => (
                                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                                    <span style={{ fontWeight: '600' }}>+{montant.toLocaleString('fr-FR')} F</span>
                                  </div>
                                ))
                              ) : (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune entrée</div>
                              )}
                            </div>

                            {/* SORTIES */}
                            <div style={{ flex: 1, minWidth: '180px' }}>
                              <div style={{ color: 'var(--danger)', fontWeight: '700', marginBottom: '8px', borderBottom: '1px solid rgba(239,68,68,0.2)', paddingBottom: '4px', fontSize: '0.85rem' }}>
                                Flux Sortants
                              </div>
                              {Object.keys(day.details.sorties).length > 0 ? (
                                Object.entries(day.details.sorties).map(([cat, montant]) => (
                                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{cat}</span>
                                    <span style={{ fontWeight: '600' }}>-{montant.toLocaleString('fr-FR')} F</span>
                                  </div>
                                ))
                              ) : (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune sortie</div>
                              )}
                            </div>

                            {/* CANAUX */}
                            <div style={{ flex: 1, minWidth: '180px' }}>
                              <div style={{ color: 'var(--accent-color)', fontWeight: '700', marginBottom: '8px', borderBottom: '1px solid rgba(59,130,246,0.2)', paddingBottom: '4px', fontSize: '0.85rem' }}>
                                Mouvements par Canal
                              </div>
                              {accountsList.map(acc => {
                                const m = day.modes[acc.id];
                                if (m.entrees === 0 && m.sorties === 0) return null;
                                return (
                                  <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{acc.label}</span>
                                    <span style={{ display: 'flex', gap: '8px' }}>
                                      {m.entrees > 0 && <span style={{ color: 'var(--success)' }}>+{m.entrees.toLocaleString('fr-FR')}</span>}
                                      {m.sorties > 0 && <span style={{ color: 'var(--danger)' }}>-{m.sorties.toLocaleString('fr-FR')}</span>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Tresorerie;
