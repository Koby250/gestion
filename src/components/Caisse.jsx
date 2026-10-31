import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { PlusCircle, MinusCircle, Trash2, Save, ChevronDown, ChevronUp, FileText, ShieldAlert, CheckCircle, Search, Edit2, X, Calendar, Clock } from 'lucide-react';
import { logEvent } from '../utils/audit';
import FactureModal from './FactureModal';
import SuccessModal from './SuccessModal';
import BulkActionBar from './BulkActionBar';
import PanierPrestations from './PanierPrestations';

const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getCurrentTimeStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const Caisse = ({ activeDate = localDateStr(), currentUserNom = '', prefilledPromotion = null, onClearPrefilledPromotion = null }) => {
  // State for reference data
  const [services, setServices] = useState([]);
  const [servicesDomicile, setServicesDomicile] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [clients, setClients] = useState([]);
  const [chargesFixes, setChargesFixes] = useState([]);

  // Form state
  const [typeTransaction, setTypeTransaction] = useState('prestation');
  const [modePaiement, setModePaiement] = useState('Cash');
  const [selectedEmployeId, setSelectedEmployeId] = useState('');
  // Date & Heure saisie personnalisée
  const [dateOperation, setDateOperation] = useState(activeDate);
  const [heureOperation, setHeureOperation] = useState(getCurrentTimeStr);
  const [prevActiveDate, setPrevActiveDate] = useState(activeDate);

  if (prevActiveDate !== activeDate) {
    setPrevActiveDate(activeDate);
    setDateOperation(activeDate);
  }

  // Depense fields
  const [montant, setMontant] = useState('');
  const [motifDepense, setMotifDepense] = useState('');

  // Role detection
  const currentUserObj = employes.find(e => e.nom === currentUserNom);
  const isPrestataire = currentUserObj ? currentUserObj.categorie !== 'Support / Gestion' : false;
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  // Multi-service panier state
  const [lignesPanier, setLignesPanier] = useState([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
  const [clientNomCaisse, setClientNomCaisse] = useState('');
  const [clientIdCaisse, setClientIdCaisse] = useState('');

  const [activeHistoryTab, setActiveHistoryTab] = useState('aujourd_hui'); // 'aujourd_hui', 'cette_semaine', 'ce_mois'
  const [expandedDays, setExpandedDays] = useState({});
  const [factureModal, setFactureModal] = useState(null);
  const [editTxModal, setEditTxModal] = useState(null);
  const [editTxLignes, setEditTxLignes] = useState([]);
  const [editTxClientNom, setEditTxClientNom] = useState('');
  const [editTxModePaiement, setEditTxModePaiement] = useState('Cash');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxHeure, setEditTxHeure] = useState('');

  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Edit depense modal state
  const [editDepenseModal, setEditDepenseModal] = useState(null);
  const [editDepenseForm, setEditDepenseForm] = useState({ montant: '', motif: '', categorie: '', modePaiement: 'Cash', employeId: '' });
  const [editDepenseDate, setEditDepenseDate] = useState('');
  const [editDepenseHeure, setEditDepenseHeure] = useState('');

  // New Filters
  const [searchTxTerm, setSearchTxTerm] = useState('');
  const [dateDebutTx, setDateDebutTx] = useState('');
  const [dateFinTx, setDateFinTx] = useState('');

  // Fetch reference data
  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => s.actif));
    });
    
    const unsubServicesDomicile = onSnapshot(collection(db, 'services_domicile'), (snapshot) => {
      setServicesDomicile(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => s.actif));
    });
    
    const unsubCategories = onSnapshot(collection(db, 'depenses_categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.actif));
    });

    const unsubEmployes = onSnapshot(collection(db, 'employes'), (snapshot) => {
      setEmployes(
        snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(e => e.actif && e.categorie !== 'Support / Gestion')
      );
    });

    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubTransactions = onSnapshot(q, (snapshot) => {
      const allTx = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter out treasury adjustments so they don't appear in the daily cash register
      setTransactions(allTx.filter(t => t.type !== 'ajustement'));
    });

    const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), (snapshot) => {
      setChargesFixes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.actif));
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubServices();
      unsubServicesDomicile();
      unsubCategories();
      unsubEmployes();
      unsubTransactions();
      unsubCharges();
      unsubClients();
    };
  }, []);

  // Reset panier when switching to depense (event-driven, not via useEffect)
  const handleTypeChange = (newType) => {
    setTypeTransaction(newType);
    if (newType === 'depense') {
      setLignesPanier([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
    }
  };

  const getTransactionDate = () => {
    const timeStr = heureOperation || getCurrentTimeStr();
    const [h, m] = timeStr.split(':');
    const d = new Date(dateOperation || activeDate);
    d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
    return d.toISOString();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (typeTransaction === 'prestation') {
        const isLineInvalid = (l) => {
          if (!l.serviceId && !l.serviceNom) return true;
          // Le prix = 0 est parfaitement valide (ex: soin offert / remise 100%)
          if (l.prixFinal === '' || l.prixFinal === undefined || l.prixFinal === null || isNaN(Number(l.prixFinal)) || Number(l.prixFinal) < 0) return true;
          const isBillard = l.isBillard || (l.serviceNom || '').toLowerCase().includes('billard');
          // Le billard ne requiert PAS d'agent obligatoire
          if (!isBillard && (!l.agents || l.agents.length === 0)) return true;
          return false;
        };

        if (lignesPanier.length === 0 || lignesPanier.some(isLineInvalid)) {
          alert("Veuillez remplir correctement toutes les prestations (service, prix et agent(s) pour les services non-billard).");
          setIsSubmitting(false);
          return;
        }

        const totalMontant = lignesPanier.reduce((acc, l) => acc + Number(l.prixFinal || 0), 0);
        const allAgentNoms = [...new Set(lignesPanier.flatMap(l => (l.agents || []).map(a => a.nom)))];

        let motifDescription = '';
        if (lignesPanier.length === 1) {
          const l0 = lignesPanier[0];
          const isB = l0.isBillard || (l0.serviceNom || '').toLowerCase().includes('billard');
          if (isB && (l0.nombreParties || 1) > 1) {
            motifDescription = `Billard (${l0.nombreParties} parties)`;
          } else {
            motifDescription = l0.serviceNom || 'Prestation';
          }
        } else {
          motifDescription = `Forfait (${lignesPanier.length} prestations)`;
        }

        const firstAgent = lignesPanier.find(l => l.agents && l.agents.length > 0)?.agents?.[0];
        const promoLine = lignesPanier.find(l => l.isPromo || l.promotionId);
        const promotionId = promoLine?.promotionId || null;
        const promotionNom = promoLine?.promotionNom || null;

        const newTransaction = {
          type: 'prestation',
          montant: totalMontant,
          motif: motifDescription,
          clientNom: clientNomCaisse.trim() || 'Client anonyme',
          employeNom: allAgentNoms.length > 0 ? allAgentNoms.join(', ') : 'Aucun (Billard)',
          employeId: firstAgent?.id || '',
          modePaiement,
          date: getTransactionDate(),
          saisieParNom: currentUserNom,
          promotionId: promotionId,
          promotionNom: promotionNom,
          lignes: lignesPanier.map(l => ({
            serviceId: l.serviceId || 'billard',
            serviceNom: l.serviceNom,
            isBillard: !!(l.isBillard || (l.serviceNom || '').toLowerCase().includes('billard')),
            nombreParties: l.nombreParties || 1,
            prixUnitaire: Number(l.prixUnitaire) || Number(l.prixFinal) || 0,
            prixBase: Number(l.prixBase) || 0,
            prixFinal: Number(l.prixFinal) || 0,
            remiseType: l.remiseType || 'aucune',
            remiseValeur: l.remiseValeur || '',
            remiseMotif: l.remiseMotif || '',
            isPromo: !!l.isPromo,
            promotionId: l.promotionId || null,
            promotionNom: l.promotionNom || null,
            agents: l.agents || [],
            isDomicile: !!l.isDomicile
          }))
        };

        await addDoc(collection(db, 'transactions'), newTransaction);
        await logEvent('TRANSACTION_CREATE', `Vente multi-services (${lignesPanier.length} prestations) de ${totalMontant} FCFA${promotionNom ? ` [Promo: ${promotionNom}]` : ''}. Agents: ${allAgentNoms.join(', ') || 'Aucun'}. Mode: ${modePaiement}`);

        if (promotionId) {
          try {
            await updateDoc(doc(db, 'promotions', promotionId), {
              countUtilisations: increment(1)
            });
          } catch (err) {
            console.warn("Erreur mise à jour usage promo:", err);
          }
        }

        if (clientIdCaisse) {
          try {
            await updateDoc(doc(db, 'clients', clientIdCaisse), {
              visites: increment(1),
              chiffreAffaires: increment(totalMontant),
              lastVisit: new Date().toISOString()
            });
          } catch (e) {
            console.error("Erreur lors de la mise à jour des stats client :", e);
          }
        }

        // Reset
        setLignesPanier([{ serviceId: '', serviceNom: '', prixBase: '', prixFinal: '', agents: [], remiseType: 'aucune', remiseValeur: '', remiseMotif: '' }]);
        setClientNomCaisse('');
        setClientIdCaisse('');
        setHeureOperation(getCurrentTimeStr());
        if (onClearPrefilledPromotion) onClearPrefilledPromotion();
        setShowSuccess(true);

      } else {
        // Dépense
        if (!montant || isNaN(Number(montant))) { alert('Veuillez saisir un montant valide.'); return; }
        if (!motifDepense || !selectedCategoryId) { alert('Veuillez remplir le motif et la catégorie de la dépense.'); return; }
        if (!selectedEmployeId) { alert("Veuillez assigner un membre de l'équipe."); return; }

        const employe = employes.find(e => e.id === selectedEmployeId);

        const newTransaction = {
          type: 'depense',
          montant: Number(montant),
          motif: motifDepense,
          categorie: selectedCategoryId,
          categorieNom: selectedCategoryId,
          employeId: selectedEmployeId,
          employeNom: employe ? employe.nom : 'Inconnu',
          modePaiement,
          date: getTransactionDate(),
          saisieParNom: currentUserNom
        };

        await addDoc(collection(db, 'transactions'), newTransaction);
        await logEvent('TRANSACTION_CREATE', `Dépense de ${montant} FCFA. Motif: ${motifDepense}. Mode: ${modePaiement}`);

        setMontant('');
        setMotifDepense('');
        setSelectedCategoryId('');
        setHeureOperation(getCurrentTimeStr());
      }
    } catch (err) {
      console.error("Erreur lors de la sauvegarde :", err);
      alert("Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (t) => {
    setEditTxModal(t);
    const d = t.date ? new Date(t.date) : new Date();
    setEditTxDate(localDateStr(d));
    setEditTxHeure(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);

    if (t.type === 'prestation') {
      setEditTxLignes(t.lignes || []);
      setEditTxClientNom(t.clientNom || '');
      setEditTxModePaiement(t.modePaiement || 'Cash');
    } else {
      setEditTxClientNom('');
      setEditTxLignes([]);
      setEditTxModePaiement(t.modePaiement || 'Cash');
    }
  };

  const handleSaveEditTransaction = async () => {
    if (!editTxModal) return;
    setIsEditing(true);
    try {
      if (editTxModal.type === 'prestation') {
        const isLineInvalid = (l) => {
          if (!l.serviceId && !l.serviceNom) return true;
          if (l.prixFinal === '' || l.prixFinal === undefined || l.prixFinal === null || isNaN(Number(l.prixFinal)) || Number(l.prixFinal) < 0) return true;
          const isBillard = l.isBillard || (l.serviceNom || '').toLowerCase().includes('billard');
          if (!isBillard && (!l.agents || l.agents.length === 0)) return true;
          return false;
        };

        if (editTxLignes.length === 0 || editTxLignes.some(isLineInvalid)) {
          alert("Veuillez vérifier les prestations modifiées (service, prix et agents si requis).");
          setIsEditing(false);
          return;
        }

        const total = editTxLignes.reduce((acc, l) => acc + Number(l.prixFinal || 0), 0);
        
        let employeId = editTxModal.employeId || null;
        let employeNom = editTxModal.employeNom || 'Inconnu';
        
        const allAgents = [...new Set(editTxLignes.flatMap(l => (l.agents || []).map(a => a.nom)))];
        if (allAgents.length === 1) {
          const a = editTxLignes.find(l => l.agents && l.agents.length > 0)?.agents?.[0];
          employeId = a?.id || null;
          employeNom = a?.nom || 'Inconnu';
        } else if (allAgents.length > 1) {
          employeNom = allAgents.join(', ');
          employeId = 'multi';
        } else {
          employeNom = 'Aucun (Billard)';
          employeId = '';
        }

        // Reconstruire la date et heure choisies
        const [h, m] = (editTxHeure || '12:00').split(':');
        const d = new Date(editTxDate || localDateStr());
        d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
        const newDateISO = d.toISOString();

        let motifDesc = '';
        if (editTxLignes.length === 1) {
          const l0 = editTxLignes[0];
          const isB = l0.isBillard || (l0.serviceNom || '').toLowerCase().includes('billard');
          if (isB && (l0.nombreParties || 1) > 1) {
            motifDesc = `Billard (${l0.nombreParties} parties)`;
          } else {
            motifDesc = l0.serviceNom || 'Prestation';
          }
        } else {
          motifDesc = `Forfait (${editTxLignes.length} prestations)`;
        }

        const promoLine = editTxLignes.find(l => l.isPromo || l.promotionId);
        const promoId = promoLine?.promotionId || editTxModal.promotionId || null;
        const promoNom = promoLine?.promotionNom || editTxModal.promotionNom || null;

        await updateDoc(doc(db, 'transactions', editTxModal.id), {
          montant: total,
          motif: motifDesc,
          clientNom: editTxClientNom,
          modePaiement: editTxModePaiement,
          lignes: editTxLignes,
          employeId: employeId,
          employeNom: employeNom,
          date: newDateISO,
          promotionId: promoId,
          promotionNom: promoNom,
          modifieParNom: currentUserNom,
          dateModification: new Date().toISOString()
        });
        await logEvent('TRANSACTION_UPDATE', `Modification de la prestation (${total} FCFA) au ${editTxDate} à ${editTxHeure} par ${currentUserNom}`);
      }
      setEditTxModal(null);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la modification.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleOpenEditDepense = (t) => {
    setEditDepenseModal(t);
    const d = t.date ? new Date(t.date) : new Date();
    setEditDepenseDate(localDateStr(d));
    setEditDepenseHeure(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);

    setEditDepenseForm({
      montant: t.montant || '',
      motif: t.motif || '',
      categorie: t.categorie || '',
      modePaiement: t.modePaiement || 'Cash',
      employeId: t.employeId || ''
    });
  };

  const handleSaveEditDepense = async () => {
    if (!editDepenseModal) return;
    const { montant, motif, categorie, modePaiement, employeId } = editDepenseForm;
    if (!montant || isNaN(Number(montant))) { alert('Montant invalide.'); return; }
    if (!categorie) { alert('Veuillez sélectionner une catégorie.'); return; }
    setIsEditing(true);
    try {
      const employe = employes.find(e => e.id === employeId);

      // Reconstruire la date et heure choisies
      const [h, m] = (editDepenseHeure || '12:00').split(':');
      const d = new Date(editDepenseDate || localDateStr());
      d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
      const newDateISO = d.toISOString();

      await updateDoc(doc(db, 'transactions', editDepenseModal.id), {
        montant: Number(montant),
        motif,
        categorie,
        modePaiement,
        employeId: employeId || null,
        employeNom: employe ? employe.nom : (editDepenseModal.employeNom || 'Inconnu'),
        date: newDateISO,
        modifieParNom: currentUserNom,
        dateModification: new Date().toISOString()
      });
      await logEvent('TRANSACTION_UPDATE', `Modification dépense (${montant} FCFA, catégorie: ${categorie}) au ${editDepenseDate} à ${editDepenseHeure} par ${currentUserNom}`);
      setEditDepenseModal(null);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la modification.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async (id, typeTransaction, montant, motif) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette opération ?")) {
      await deleteDoc(doc(db, 'transactions', id));
      await logEvent('TRANSACTION_DELETE', `Suppression transaction (${typeTransaction}) de ${montant} FCFA. Motif: ${motif}`);
    }
  };

  const toggleDayAccordion = (dayStr) => {
    setExpandedDays(prev => ({ ...prev, [dayStr]: !prev[dayStr] }));
  };

  // Filter transactions
  const getFilteredTransactions = () => {
    let filtered = transactions;

    if (dateDebutTx || dateFinTx) {
      filtered = filtered.filter(t => {
        const d = new Date(t.date);
        const dStart = dateDebutTx ? new Date(dateDebutTx) : new Date(0);
        dStart.setHours(0,0,0,0);
        const dEnd = dateFinTx ? new Date(dateFinTx) : new Date(8640000000000000);
        dEnd.setHours(23,59,59,999);
        return d >= dStart && d <= dEnd;
      });
    } else {
      const activeDateObj = new Date(activeDate);
      
      // Start of Active Day
      const startOfToday = new Date(activeDateObj);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(activeDateObj);
      endOfToday.setHours(23, 59, 59, 999);

      // Start of Week (Monday)
      const currentDay = activeDateObj.getDay() === 0 ? 7 : activeDateObj.getDay();
      const startOfWeek = new Date(activeDateObj);
      startOfWeek.setDate(activeDateObj.getDate() - currentDay + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      // Start of Month
      const startOfMonth = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), 1);

      filtered = filtered.filter(t => {
        const d = new Date(t.date);
        if (activeHistoryTab === 'aujourd_hui') {
          return d >= startOfToday && d <= endOfToday;
        } else if (activeHistoryTab === 'cette_semaine') {
          return d >= startOfWeek && d <= endOfToday;
        } else { // 'ce_mois'
          return d >= startOfMonth && d <= endOfToday;
        }
      });
    }

    if (searchTxTerm) {
      const st = searchTxTerm.toLowerCase();
      filtered = filtered.filter(t => 
        (t.motif || '').toLowerCase().includes(st) ||
        (t.clientNom || '').toLowerCase().includes(st) ||
        (t.employeNom || '').toLowerCase().includes(st) ||
        (t.modePaiement || '').toLowerCase().includes(st)
      );
    }

    return filtered;
  };

  const filteredTransactions = getFilteredTransactions();

  // Group by day for "Cette Semaine" and "Ce Mois"
  const groupedTransactions = {};
  filteredTransactions.forEach(t => {
    const d = new Date(t.date);
    const dayStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const capitalizedDayStr = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
    
    if (!groupedTransactions[capitalizedDayStr]) {
      groupedTransactions[capitalizedDayStr] = {
        dateRef: d,
        transactions: [],
        total: 0,
        count: 0
      };
    }
    groupedTransactions[capitalizedDayStr].transactions.push(t);
    groupedTransactions[capitalizedDayStr].count += 1;
    if (t.type === 'prestation') {
      groupedTransactions[capitalizedDayStr].total += Number(t.montant);
    } else {
      groupedTransactions[capitalizedDayStr].total -= Number(t.montant);
    }
  });

  const sortedDays = Object.keys(groupedTransactions).sort((a, b) => {
    return groupedTransactions[b].dateRef - groupedTransactions[a].dateRef;
  });

  // Calculate totals
  const totalVentes = filteredTransactions
    .filter(t => t.type === 'prestation')
    .reduce((acc, curr) => acc + Number(curr.montant), 0);

  const totalDepenses = filteredTransactions
    .filter(t => t.type === 'depense')
    .reduce((acc, curr) => acc + Number(curr.montant), 0);

  const resteEnCaisse = totalVentes - totalDepenses;

  // Format time
  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // Safe Spend Simulator variables
  const simActiveDateObj = new Date(activeDate);
  const simStartOfMonth = new Date(simActiveDateObj.getFullYear(), simActiveDateObj.getMonth(), 1);
  const currentMonthTx = transactions.filter(t => new Date(t.date) >= simStartOfMonth && new Date(t.date) <= new Date(simActiveDateObj.getFullYear(), simActiveDateObj.getMonth() + 1, 0, 23, 59, 59, 999));
  
  const totalMonthCA = currentMonthTx.filter(t => t.type === 'prestation').reduce((acc, t) => acc + Number(t.montant), 0);
  const totalSalaries = employes.reduce((acc, emp) => acc + (Number(emp.salaireFixe) || 0), 0);
  const totalChargesFixesVal = chargesFixes.reduce((acc, c) => acc + (Number(c.montant) || 0), 0);
  const tresorerieNetteVal = totalMonthCA - totalSalaries - totalChargesFixesVal;

  let simStatus = null;
  if (typeTransaction === 'depense' && montant) {
    const askAmount = Number(montant) || 0;
    if (tresorerieNetteVal >= askAmount) {
      simStatus = {
        color: 'var(--success)', icon: <CheckCircle size={18} />,
        text: `VERT : Le fonds de roulement actuel permet ce ravitaillement. Trésorerie nette restante : ${tresorerieNetteVal - askAmount} F.`
      };
    } else {
      simStatus = {
        color: 'var(--danger)', icon: <ShieldAlert size={18} />,
        text: `ROUGE : Risque de découvert ! Trésorerie nette (${tresorerieNetteVal} F) insuffisante.`
      };
    }
  }



  // Bulk Selection Helpers
  const toggleSelection = (id) => {
    setSelectedTransactions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleAll = (e, txList) => {
    if (e.target.checked) setSelectedTransactions(txList.map(t => t.id));
    else setSelectedTransactions([]);
  };

  // Reusable component for Transaction Table
  const renderTransactionTable = (txList) => (
    <>
      {/* ── DESKTOP TABLE ─────────────────────────────────────────── */}
      <div className="table-responsive desktop-table">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px', width: '40px' }}>
                <input 
                  type="checkbox" 
                  onChange={(e) => toggleAll(e, txList)}
                  checked={txList.length > 0 && txList.every(t => selectedTransactions.includes(t.id))}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '10px' }}>Heure</th>
              <th style={{ padding: '10px' }}>Type</th>
              <th style={{ padding: '10px' }}>Motif</th>
              <th style={{ padding: '10px' }}>Employé</th>
              <th style={{ padding: '10px' }}>Mode</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Montant</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {txList.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucune opération.
                </td>
              </tr>
            ) : (
              txList.map(t => (
                <tr key={t.id} style={{ 
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: selectedTransactions.includes(t.id) ? 'rgba(37,99,235,0.05)' : 'transparent'
                }}>
                  <td style={{ padding: '10px' }}>
                    <input 
                      type="checkbox"
                      checked={selectedTransactions.includes(t.id)}
                      onChange={() => toggleSelection(t.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '10px', fontSize: '0.9rem' }}>{formatTime(t.date)}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem', 
                      backgroundColor: t.type === 'prestation' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: t.type === 'prestation' ? 'var(--success)' : 'var(--danger)',
                      fontWeight: '600'
                    }}>
                      {t.type === 'prestation' ? 'Vente' : 'Dépense'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontWeight: '500' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{t.motif}</span>
                      {(t.promotionNom || t.promotionId) && (
                        <span style={{
                          fontSize: '0.72rem',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#d97706',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          fontWeight: 700
                        }}>
                          🎁 {t.promotionNom || 'Promotion'}
                        </span>
                      )}
                    </div>
                    {t.clientNom && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Client : {t.clientNom}</span>}
                    {t.type === 'depense' && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.categorie}</span>}
                    {t.lignes && t.lignes.length > 1 && (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {t.lignes.map((l, i) => (
                          <span key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            {l.serviceNom} — {(l.agents || []).map(a => a.nom).join(', ')} — {Number(l.prixFinal).toLocaleString('fr-FR')} FCFA
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <div>{t.employeNom}</div>
                    {t.saisieParNom && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Saisi par : {t.saisieParNom}
                      </div>
                    )}
                    {t.modifieParNom && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                        Modifié par : {t.modifieParNom}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem',
                      backgroundColor: 'var(--bg-input)', fontWeight: '600', color: 'var(--text-main)'
                    }}>
                      {t.modePaiement}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: t.type === 'prestation' ? 'var(--success)' : 'var(--text-main)' }}>
                    {t.type === 'depense' ? '-' : ''}{t.montant} FCFA
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      {t.type === 'prestation' ? (
                        <>
                          <button 
                            onClick={() => handleOpenEditModal(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                            title="Modifier"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => setFactureModal(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}
                            title="Reçu"
                          >
                            <FileText size={18} />
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={() => handleOpenEditDepense(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                          title="Modifier cette dépense"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(t.id, t.type, t.montant, t.motif)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── MOBILE CARDS ───────────────────────────────────────────── */}
      <div className="mobile-cards">
        {txList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            Aucune opération.
          </div>
        ) : (
          txList.map(t => (
            <div key={t.id} className="card" style={{
              padding: '12px 14px',
              marginBottom: '10px',
              border: selectedTransactions.includes(t.id) ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
              borderRadius: '12px',
              background: 'var(--card-bg)'
            }}>
              {/* Header: Checkbox + Time + Type badge + Mode badge + Amount */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox"
                    checked={selectedTransactions.includes(t.id)}
                    onChange={() => toggleSelection(t.id)}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {formatTime(t.date)}
                  </span>
                  <span style={{ 
                    padding: '2px 8px', 
                    borderRadius: '8px', 
                    fontSize: '0.72rem', 
                    backgroundColor: t.type === 'prestation' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: t.type === 'prestation' ? 'var(--success)' : 'var(--danger)',
                    fontWeight: 700
                  }}>
                    {t.type === 'prestation' ? 'Vente' : 'Dépense'}
                  </span>
                </div>
                <span style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: t.type === 'prestation' ? 'var(--success)' : 'var(--danger)'
                }}>
                  {t.type === 'depense' ? '-' : '+'}{Number(t.montant).toLocaleString('fr-FR')} F
                </span>
              </div>

              {/* Content: Motif / Services / Promo */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>{t.motif}</span>
                  {(t.promotionNom || t.promotionId) && (
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#d97706',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      fontWeight: 700
                    }}>
                      🎁 {t.promotionNom || 'Promo'}
                    </span>
                  )}
                </div>
                {t.clientNom && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    👤 Client : <strong style={{ color: 'var(--text-main)' }}>{t.clientNom}</strong>
                  </div>
                )}
                {t.type === 'depense' && t.categorie && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    📁 Catégorie : {t.categorie}
                  </div>
                )}
                {t.lignes && t.lignes.length > 1 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {t.lignes.map((l, i) => (
                      <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '3px 8px', borderRadius: '6px' }}>
                        • {l.serviceNom} {l.agents && l.agents.length > 0 && `(${l.agents.map(a => a.nom).join(', ')})`} : {Number(l.prixFinal).toLocaleString('fr-FR')} F
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer: Employé, Mode, Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '2px 6px', background: 'var(--bg-input)', borderRadius: '4px', fontWeight: 600 }}>
                    {t.modePaiement}
                  </span>
                  <span>{t.employeNom}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {t.type === 'prestation' ? (
                    <>
                      <button 
                        onClick={() => handleOpenEditModal(t)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '4px' }}
                        title="Modifier"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setFactureModal(t)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '4px' }}
                        title="Reçu"
                      >
                        <FileText size={16} />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleOpenEditDepense(t)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '4px' }}
                      title="Modifier cette dépense"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(t.id, t.type, t.montant, t.motif)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="view-container">
      {showSuccess && <SuccessModal message="Opération validée avec succès !" onClose={() => setShowSuccess(false)} />}
      
      {/* FORMULAIRE DE SAISIE */}
      <div className="card">
        <h2 className="card-title">Nouvelle Opération</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            type="button"
            className={`btn ${typeTransaction === 'prestation' ? 'btn-success' : ''}`}
            onClick={() => handleTypeChange('prestation')}
            style={{ flex: 1, backgroundColor: typeTransaction === 'prestation' ? 'var(--success)' : 'var(--bg-input)', color: typeTransaction === 'prestation' ? '#fff' : 'var(--text-main)' }}
          >
            <PlusCircle size={18} /> Prestation / Vente
          </button>
          {!isPrestataire && (
            <button 
              type="button"
              className={`btn ${typeTransaction === 'depense' ? 'btn-danger' : ''}`}
              onClick={() => handleTypeChange('depense')}
              style={{ flex: 1, backgroundColor: typeTransaction === 'depense' ? 'var(--danger)' : 'var(--bg-input)', color: typeTransaction === 'depense' ? '#fff' : 'var(--text-main)' }}
            >
              <MinusCircle size={18} /> Dépense / Charge
            </button>
          )}
        </div>

        <form onSubmit={handleSave}>
          {/* Horodatage réglable de la prestation / dépense */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '12px 16px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border-color)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '160px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Calendar size={14} color="var(--accent)" /> Date de l'opération
              </label>
              <input 
                type="date" 
                className="input-control" 
                style={{ margin: 0 }} 
                value={dateOperation} 
                onChange={e => setDateOperation(e.target.value)} 
              />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Clock size={14} color="var(--accent)" /> Heure de l'opération
              </label>
              <input 
                type="time" 
                className="input-control" 
                style={{ margin: 0 }} 
                value={heureOperation} 
                onChange={e => setHeureOperation(e.target.value)} 
              />
            </div>
          </div>

          {typeTransaction === 'prestation' ? (
            <PanierPrestations
              lignes={lignesPanier}
              setLignes={setLignesPanier}
              services={services}
              servicesDomicile={servicesDomicile}
              employes={employes.filter(e => e.categorie !== 'Support / Gestion')}
              clientNom={clientNomCaisse}
              setClientNom={setClientNomCaisse}
              clientId={clientIdCaisse}
              setClientId={setClientIdCaisse}
              modePaiement={modePaiement}
              setModePaiement={setModePaiement}
              showClientField={true}
              clients={clients}
              prefilledPromotion={prefilledPromotion}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div className="form-group">
                <label>Motif de la dépense</label>
                <input type="text" className="input-control" placeholder="Ex: Achat produits, Facture..."
                  value={motifDepense} onChange={(e) => setMotifDepense(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Catégorie</label>
                <select className="input-control" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                  <option value="">Sélectionner une charge...</option>
                  {chargesFixes.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                  {categories.length > 0 && (
                    <optgroup label="Autres catégories">
                      {categories.filter(cat => !chargesFixes.some(cf => cf.nom === cat.nom)).map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="form-group">
                <label>Montant (FCFA)</label>
                <input type="number" className="input-control" placeholder="Ex: 5000"
                  value={montant} onChange={(e) => setMontant(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Mode de paiement</label>
                <select className="input-control" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="NITA">NITA</option>
                  <option value="AMANA">AMANA</option>
                  <option value="Carte VISA">Carte VISA</option>
                </select>
              </div>
              <div className="form-group">
                <label>Membre de l'équipe</label>
                <select className="input-control" value={selectedEmployeId} onChange={(e) => setSelectedEmployeId(e.target.value)}>
                  <option value="">Assigner à...</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            </div>
          )}

          {typeTransaction === 'depense' && simStatus && (
            <div style={{
              padding: '12px', borderRadius: '8px', marginTop: '15px', fontSize: '0.9rem',
              backgroundColor: 'var(--bg-input)', color: simStatus.color, display: 'flex', alignItems: 'center', gap: '10px',
              border: `1px solid ${simStatus.color}`
            }}>
              <div>{simStatus.icon}</div>
              <div style={{ fontWeight: '600', lineHeight: '1.4' }}>{simStatus.text}</div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }}>
            <Save size={18} /> Enregistrer
          </button>
        </form>
      </div>

      {/* JOURNAL D'HISTORIQUE AVEC ONGLETS ET FILTRES */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 className="card-title" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>Journal des opérations</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '15px' }} />
            <input 
              type="text" 
              className="input-control" 
              style={{ paddingLeft: '40px', width: '100%', minHeight: '48px', margin: 0 }}
              placeholder="Rechercher par motif, client..." 
              value={searchTxTerm} 
              onChange={e => setSearchTxTerm(e.target.value)} 
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Du</label>
              <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateDebutTx} onChange={e => setDateDebutTx(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Au</label>
              <input type="date" className="input-control" style={{ margin: 0, minHeight: '48px' }} value={dateFinTx} onChange={e => setDateFinTx(e.target.value)} />
            </div>
          </div>
        </div>

        {(!dateDebutTx && !dateFinTx) && (
          <div style={{ display: 'flex', gap: '5px', backgroundColor: 'var(--bg-input)', padding: '5px', borderRadius: '12px', marginBottom: '15px', width: 'fit-content' }}>
            <button 
              className={`nav-btn ${activeHistoryTab === 'aujourd_hui' ? 'active' : ''}`}
              onClick={() => { setActiveHistoryTab('aujourd_hui'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Aujourd'hui</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'cette_semaine' ? 'active' : ''}`}
              onClick={() => { setActiveHistoryTab('cette_semaine'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Cette Semaine</button>
            <button 
              className={`nav-btn ${activeHistoryTab === 'ce_mois' ? 'active' : ''}`}
              onClick={() => { setActiveHistoryTab('ce_mois'); setSelectedTransactions([]); }}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >Ce Mois</button>
          </div>
        )}

        <BulkActionBar 
          selectedIds={selectedTransactions}  
          collectionName="transactions" 
          onClearSelection={() => setSelectedTransactions([])} 
        />

        {activeHistoryTab === 'aujourd_hui' ? (
          renderTransactionTable(filteredTransactions)
        ) : (
          <div>
            {sortedDays.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Aucune opération trouvée.</p>
            ) : (
              sortedDays.map(dayStr => {
                const dayData = groupedTransactions[dayStr];
                const isExpanded = expandedDays[dayStr];
                return (
                  <div key={dayStr} className="accordion-item">
                    <div className="accordion-header" onClick={() => toggleDayAccordion(dayStr)}>
                      <div>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{dayStr}</span>
                        <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{dayData.count} Opérations</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontWeight: 'bold', color: dayData.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          Bilan : {dayData.total >= 0 ? '+' : ''}{dayData.total} FCFA
                        </span>
                        {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="accordion-content">
                        {renderTransactionTable(dayData.transactions)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* BARRE DE TOTAUX (DYNAMIQUE SELON L'ONGLET) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Ventes</h3>
          <p style={{ fontSize: '1.5rem', color: 'var(--success)', fontWeight: 'bold' }}>{totalVentes} FCFA</p>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Total Dépenses</h3>
          <p style={{ fontSize: '1.5rem', color: 'var(--danger)', fontWeight: 'bold' }}>{totalDepenses} FCFA</p>
        </div>
        <div className="card" style={{ marginBottom: 0, backgroundColor: resteEnCaisse >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '5px' }}>RESTE EN CAISSE</h3>
          <p style={{ fontSize: '1.75rem', color: resteEnCaisse >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
            {resteEnCaisse} FCFA
          </p>
        </div>
      </div>

      {factureModal && (
        <FactureModal 
          data={factureModal} 
          type="transaction" 
          onClose={() => setFactureModal(null)} 
        />
      )}

      {editTxModal && editTxModal.type === 'prestation' && (
        <div className="modal-overlay" onClick={() => setEditTxModal(null)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Modifier la prestation</h2>
              <button className="btn-icon" onClick={() => setEditTxModal(null)}><X size={20} /></button>
            </div>

            {/* Date & Heure modifiable pour la prestation */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', padding: '12px 14px', backgroundColor: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border-color)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Calendar size={13} color="var(--accent)" /> Date de la prestation
                </label>
                <input 
                  type="date" 
                  className="input-control" 
                  style={{ margin: 0 }}
                  value={editTxDate} 
                  onChange={e => setEditTxDate(e.target.value)} 
                />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '130px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <Clock size={13} color="var(--accent)" /> Heure de la prestation
                </label>
                <input 
                  type="time" 
                  className="input-control" 
                  style={{ margin: 0 }}
                  value={editTxHeure} 
                  onChange={e => setEditTxHeure(e.target.value)} 
                />
              </div>
            </div>

            <PanierPrestations 
              lignes={editTxLignes}
              setLignes={setEditTxLignes}
              services={services}
              servicesDomicile={servicesDomicile}
              employes={employes}
              clientNom={editTxClientNom}
              setClientNom={setEditTxClientNom}
              modePaiement={editTxModePaiement}
              setModePaiement={setEditTxModePaiement}
              showClientField={true}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                onClick={handleSaveEditTransaction} 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                disabled={isEditing}
              >
                {isEditing ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
              <button onClick={() => setEditTxModal(null)} className="btn" style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {editDepenseModal && (
        <div className="modal-overlay" onClick={() => setEditDepenseModal(null)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Modifier la dépense</h2>
              <button className="btn-icon" onClick={() => setEditDepenseModal(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Calendar size={13} color="var(--accent)" /> Date</label>
                  <input type="date" className="input-control" value={editDepenseDate} onChange={e => setEditDepenseDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Clock size={13} color="var(--accent)" /> Heure</label>
                  <input type="time" className="input-control" value={editDepenseHeure} onChange={e => setEditDepenseHeure(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Motif</label>
                <input
                  type="text"
                  className="input-control"
                  value={editDepenseForm.motif}
                  onChange={e => setEditDepenseForm(f => ({ ...f, motif: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Catégorie (Charge fixe)</label>
                <select
                  className="input-control"
                  value={editDepenseForm.categorie}
                  onChange={e => setEditDepenseForm(f => ({ ...f, categorie: e.target.value }))}
                >
                  <option value="">Sélectionner une charge...</option>
                  {chargesFixes.map(c => (
                    <option key={c.id} value={c.nom}>{c.nom}</option>
                  ))}
                  {categories.filter(cat => !chargesFixes.some(cf => cf.nom === cat.nom)).length > 0 && (
                    <optgroup label="Autres catégories">
                      {categories.filter(cat => !chargesFixes.some(cf => cf.nom === cat.nom)).map(c => (
                        <option key={c.id} value={c.nom}>{c.nom}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Montant (FCFA)</label>
                <input
                  type="number"
                  className="input-control"
                  value={editDepenseForm.montant}
                  onChange={e => setEditDepenseForm(f => ({ ...f, montant: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Mode de paiement</label>
                <select
                  className="input-control"
                  value={editDepenseForm.modePaiement}
                  onChange={e => setEditDepenseForm(f => ({ ...f, modePaiement: e.target.value }))}
                >
                  <option value="Cash">Cash</option>
                  <option value="NITA">NITA</option>
                  <option value="AMANA">AMANA</option>
                  <option value="Carte VISA">Carte VISA</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Assigné à</label>
                <select
                  className="input-control"
                  value={editDepenseForm.employeId}
                  onChange={e => setEditDepenseForm(f => ({ ...f, employeId: e.target.value }))}
                >
                  <option value="">-- Choisir un membre --</option>
                  {employes.map(e => (
                    <option key={e.id} value={e.id}>{e.nom}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleSaveEditDepense}
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={isEditing}
              >
                {isEditing ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                onClick={() => setEditDepenseModal(null)}
                className="btn"
                style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Caisse;
