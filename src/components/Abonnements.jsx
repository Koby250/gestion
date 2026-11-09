import { useState, useEffect, useMemo } from 'react';
import {
  Repeat, PlusCircle, Search,
  CheckCircle2, X, SlidersHorizontal
} from 'lucide-react';
import {
  collection, onSnapshot, addDoc, updateDoc, doc,
  arrayUnion, increment, orderBy, query
} from 'firebase/firestore';
import { db } from '../firebase';
import { logEvent } from '../utils/audit';
import SuccessModal from './SuccessModal';
import ModalPortal from './ModalPortal';

// Helper date locale YYYY-MM-DD
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

// Formateur de date FR
const formatDateFr = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

const formatDateTimeFr = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

/**
 * Calcule la date de fin estimée selon la date de début, le nombre de séances et la fréquence
 */
const computeEndDate = (startDateStr, nbSeances, frequence) => {
  if (!startDateStr) return localDateStr();
  const d = new Date(startDateStr);
  const rawN = parseInt(nbSeances, 10);
  const n = (!isNaN(rawN) && rawN > 0) ? rawN : 1;

  if (frequence === 'hebdomadaire') {
    d.setDate(d.getDate() + (n * 7));
  } else if (frequence === 'bimensuelle') {
    d.setDate(d.getDate() + (n * 14));
  } else if (frequence === 'mensuelle') {
    d.setMonth(d.getMonth() + n);
  } else {
    // Personnalisé : 30 jours par défaut
    d.setDate(d.getDate() + (n * 30));
  }
  return localDateStr(d);
};

/**
 * Calcule la date prévisionnelle de la prochaine séance
 */
const computeNextSessionDate = (lastDateStr, frequence) => {
  const d = lastDateStr ? new Date(lastDateStr) : new Date();
  if (frequence === 'hebdomadaire') {
    d.setDate(d.getDate() + 7);
  } else if (frequence === 'bimensuelle') {
    d.setDate(d.getDate() + 14);
  } else if (frequence === 'mensuelle') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 14);
  }
  return localDateStr(d);
};

/**
 * Liste exhaustive des mots-clés de boissons et eaux à exclure formellement des abonnements.
 * Tous les termes sont sans accent et vérifiés avec délimiteurs de mots.
 */
const BEVERAGE_KEYWORDS = [
  'boisson', 'boissons', 'drink', 'drinks', 'beverage', 'beverages',
  'eau', 'eaux', 'water', 'jus', 'juice',
  'cocktail', 'cocktails', 'mocktail', 'mocktails', 'mojito',
  'cafe', 'coffee', 'espresso', 'expresso', 'cappuccino', 'capuccino', 'latte', 'macchiato', 'nescafe',
  'the', 'tea', 'infusion', 'tisane', 'chocolat chaud',
  'soda', 'sodas', 'coca', 'coke', 'fanta', 'sprite', 'pepsi', 'schweppes', 'tonic', 'orangina', 'limonade',
  'biere', 'bieres', 'beer', 'beers', 'heineken', 'corona', 'castel', 'beaufort', 'guinness', 'desperados', 'panache',
  'vin', 'vins', 'wine', 'champagne', 'champagnes', 'prosecco', 'cava',
  'whisky', 'whiskey', 'vodka', 'rhum', 'rum', 'gin', 'tequila', 'liqueur', 'sirop', 'alcool', 'aperitif',
  'red bull', 'redbull', 'monster', 'energisante', 'energetique',
  'smoothie', 'smoothies', 'milkshake', 'canette',
  'kirene', 'tangui', 'celeste', 'perrier', 'san pellegrino', 'evian', 'volvic', 'cristaline',
  'bissap', 'gingembre', 'bouye'
];

/**
 * Détermine si un service correspond à une boisson ou de l'eau (pour exclusion totale des abonnements)
 */
const isBeverageService = (service) => {
  if (!service) return false;
  const cat = (service.categorie || '').toLowerCase().trim();
  if (cat === 'boisson' || cat === 'boissons' || service.isBoisson) return true;

  const normName = (service.nom || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const normCat = cat
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const normDesc = (service.description || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const textToScan = `${normName} ${normCat} ${normDesc}`;

  return BEVERAGE_KEYWORDS.some(kw => {
    const regex = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'i');
    return regex.test(textToScan);
  });
};

const Abonnements = ({ currentUserNom = 'Admin' }) => {
  // Collections Firestore
  const [abonnements, setAbonnements] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [employes, setEmployes] = useState([]);

  // Filtres & Recherche
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous'); // 'tous' | 'actif' | 'termine' | 'suspendu' | 'annule' | 'expirant_bientot' | 'une_seance'

  // Modals & Vues
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAbonnement, setSelectedAbonnement] = useState(null);
  const [consumeModalAbonnement, setConsumeModalAbonnement] = useState(null);
  const [statusChangeModal, setStatusChangeModal] = useState(null); // { abonnement, targetStatus }
  const [editCarnetModal, setEditCarnetModal] = useState(null); // { abonnement }
  const [editCarnetNbSeances, setEditCarnetNbSeances] = useState(0);
  const [editCarnetDoneSeances, setEditCarnetDoneSeances] = useState(0);
  const [editCarnetFrequence, setEditCarnetFrequence] = useState('hebdomadaire');
  const [editCarnetDateFin, setEditCarnetDateFin] = useState(localDateStr());
  const [editCarnetStatut, setEditCarnetStatut] = useState('actif');
  const [editCarnetMotif, setEditCarnetMotif] = useState('');
  const [isSavingCarnet, setIsSavingCarnet] = useState(false);

  // État de chargement / succès
  const [isSaving, setIsSaving] = useState(false);
  const [isConsuming, setIsConsuming] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // ── Formulaire Création d'Abonnement ──────────────────────────────────────
  const [isNewClient, setIsNewClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [clientPrenom, setClientPrenom] = useState('');
  const [clientTelephone, setClientTelephone] = useState('');

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [nombreSeances, setNombreSeances] = useState(1);
  const [frequence, setFrequence] = useState('hebdomadaire'); // 'hebdomadaire' | 'bimensuelle' | 'mensuelle' | 'personnalisee'
  const [dateDebut, setDateDebut] = useState(localDateStr());
  const [dateFin, setDateFin] = useState(computeEndDate(localDateStr(), 1, 'hebdomadaire'));
  const [isDateFinManual, setIsDateFinManual] = useState(false);

  // Tarification
  const [remiseType, setRemiseType] = useState('aucune'); // 'aucune' | 'pourcentage' | 'fixe' | 'manuel'
  const [remiseValeur, setRemiseValeur] = useState('');
  const [prixFinalPayeInput, setPrixFinalPayeInput] = useState('');
  const [modePaiement, setModePaiement] = useState('Cash');
  const [commentaire, setCommentaire] = useState('');

  // ── Formulaire Validation de Séance ──────────────────────────────────────
  const [consumeEmployeId, setConsumeEmployeId] = useState('');
  const [consumeDate, setConsumeDate] = useState(localDateStr());
  const [consumeNotes, setConsumeNotes] = useState('');

  // ── Formulaire Changement de Statut ──────────────────────────────────────
  const [statusMotif, setStatusMotif] = useState('');

  // Écoute temps réel Firestore
  useEffect(() => {
    const qAb = query(collection(db, 'abonnements'), orderBy('createdAt', 'desc'));
    const unsubAb = onSnapshot(qAb, (snap) => {
      setAbonnements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubServices = onSnapshot(collection(db, 'services'), (snap) => {
      const activeServices = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.actif !== false && !isBeverageService(s))
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }));
      setServices(activeServices);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubEmployes = onSnapshot(collection(db, 'employes'), (snap) => {
      const activeEmp = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.actif !== false);
      setEmployes(activeEmp);
    });

    return () => {
      unsubAb();
      unsubServices();
      unsubClients();
      unsubEmployes();
    };
  }, []);

  // Handlers pour la synchronisation dynamique de dateFin sans effet en cascade
  const handleNombreSeancesChange = (newCount) => {
    if (newCount === '') {
      setNombreSeances('');
      if (!isDateFinManual) {
        setDateFin(computeEndDate(dateDebut, 0, frequence));
      }
      return;
    }
    const n = parseInt(newCount, 10);
    if (!isNaN(n) && n >= 0) {
      setNombreSeances(n);
      if (!isDateFinManual) {
        setDateFin(computeEndDate(dateDebut, n, frequence));
      }
    }
  };

  const handleFrequenceChange = (newFreq) => {
    setFrequence(newFreq);
    if (!isDateFinManual) {
      const n = nombreSeances === '' ? 0 : Number(nombreSeances);
      setDateFin(computeEndDate(dateDebut, n, newFreq));
    }
  };

  const handleDateDebutChange = (newStart) => {
    setDateDebut(newStart);
    if (!isDateFinManual) {
      const n = nombreSeances === '' ? 0 : Number(nombreSeances);
      setDateFin(computeEndDate(newStart, n, frequence));
    }
  };

  const handleToggleDateFinManual = () => {
    const nextManual = !isDateFinManual;
    setIsDateFinManual(nextManual);
    if (!nextManual) {
      const n = nombreSeances === '' ? 0 : Number(nombreSeances);
      setDateFin(computeEndDate(dateDebut, n, frequence));
    }
  };

  // Récupération du service sélectionné
  const currentService = useMemo(() => {
    return services.find(s => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  // Calculs financiers du formulaire
  const { totalStandard, remiseMontant, prixFinalPaye } = useMemo(() => {
    const unitPrice = currentService ? Number(currentService.prixDefaut || 0) : 0;
    const n = nombreSeances === '' ? 0 : Math.max(0, parseInt(nombreSeances, 10) || 0);
    const standard = unitPrice * n;

    let remMontant = 0;
    let finalPaye = standard;

    if (remiseType === 'pourcentage') {
      const pct = Math.min(100, Math.max(0, parseFloat(remiseValeur) || 0));
      remMontant = Math.round((standard * pct) / 100);
      finalPaye = Math.max(0, standard - remMontant);
    } else if (remiseType === 'fixe') {
      const valFixe = Math.max(0, parseFloat(remiseValeur) || 0);
      remMontant = Math.min(standard, valFixe);
      finalPaye = Math.max(0, standard - remMontant);
    } else if (remiseType === 'manuel') {
      const manualVal = parseFloat(prixFinalPayeInput);
      if (!isNaN(manualVal) && manualVal >= 0) {
        finalPaye = manualVal;
        remMontant = Math.max(0, standard - manualVal);
      } else {
        finalPaye = standard;
        remMontant = 0;
      }
    }

    return {
      totalStandard: standard,
      remiseMontant: remMontant,
      prixFinalPaye: finalPaye
    };
  }, [currentService, nombreSeances, remiseType, remiseValeur, prixFinalPayeInput]);

  // Clients filtrés pour l'autocomplétion
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 15);
    const q = clientSearch.toLowerCase();
    return clients.filter(c =>
      (c.nom || '').toLowerCase().includes(q) ||
      (c.prenom || '').toLowerCase().includes(q) ||
      (c.telephone || '').toLowerCase().includes(q)
    ).slice(0, 15);
  }, [clients, clientSearch]);

  // Sélection d'un client existant
  const handleSelectClient = (c) => {
    setSelectedClientId(c.id);
    setClientNom(c.nom || '');
    setClientPrenom(c.prenom || '');
    setClientTelephone(c.telephone || '');
    setClientSearch(`${c.prenom || ''} ${c.nom || ''}`.trim());
  };

  // KPIs en en-tête
  const stats = useMemo(() => {
    const today = localDateStr();
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = localDateStr(in7Days);

    let actifs = 0;
    let termines = 0;
    let suspendus = 0;
    let annules = 0;
    let seancesRestantes = 0;
    let expirationsProches = 0;
    let uneSeanceRestante = 0;
    let caTotal = 0;

    abonnements.forEach(a => {
      const totalN = Number(a.nombreSeances || 0);
      const effectuees = Number(a.seancesEffectuees || 0);
      const restant = Math.max(0, totalN - effectuees);
      caTotal += Number(a.prixPaye || 0);

      if (a.statut === 'actif') {
        actifs++;
        seancesRestantes += restant;

        if (restant === 1) {
          uneSeanceRestante++;
        }

        if (a.dateFin && (a.dateFin <= in7DaysStr || a.dateFin < today)) {
          expirationsProches++;
        }
      } else if (a.statut === 'termine') {
        termines++;
      } else if (a.statut === 'suspendu') {
        suspendus++;
      } else if (a.statut === 'annule') {
        annules++;
      }
    });

    return {
      total: abonnements.length,
      actifs,
      termines,
      suspendus,
      annules,
      seancesRestantes,
      expirationsProches,
      uneSeanceRestante,
      caTotal
    };
  }, [abonnements]);

  // Filtrage de la liste
  const filteredAbonnements = useMemo(() => {
    const today = localDateStr();
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = localDateStr(in7Days);

    return abonnements.filter(a => {
      // Filtre statut
      if (filterStatut === 'actif' && a.statut !== 'actif') return false;
      if (filterStatut === 'termine' && a.statut !== 'termine') return false;
      if (filterStatut === 'suspendu' && a.statut !== 'suspendu') return false;
      if (filterStatut === 'annule' && a.statut !== 'annule') return false;
      if (filterStatut === 'expirant_bientot') {
        if (a.statut !== 'actif') return false;
        if (!a.dateFin || (a.dateFin > in7DaysStr && a.dateFin >= today)) return false;
      }
      if (filterStatut === 'une_seance') {
        if (a.statut !== 'actif') return false;
        const restant = Math.max(0, (a.nombreSeances || 0) - (a.seancesEffectuees || 0));
        if (restant !== 1) return false;
      }

      // Recherche texte
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const nomComplet = `${a.clientPrenom || ''} ${a.clientNom || ''}`.toLowerCase();
        const service = (a.serviceNom || '').toLowerCase();
        const tel = (a.clientTelephone || '').toLowerCase();
        if (!nomComplet.includes(q) && !service.includes(q) && !tel.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [abonnements, filterStatut, searchTerm]);

  // ── Soumission de la Création ──────────────────────────────────────────────
  const handleCreateAbonnement = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    if (!selectedServiceId || !currentService || isBeverageService(currentService)) {
      alert("Veuillez sélectionner une prestation valide (les boissons ne sont pas éligibles aux abonnements).");
      return;
    }

    const n = nombreSeances === '' ? 0 : parseInt(nombreSeances, 10);
    if (isNaN(n) || n < 0) {
      alert("Veuillez renseigner un nombre de séances valide (0 ou supérieur).");
      return;
    }

    if (!clientNom.trim() && !clientPrenom.trim()) {
      alert("Veuillez renseigner le nom ou le prénom du client.");
      return;
    }

    setIsSaving(true);
    try {
      const fullClientName = `${clientPrenom.trim()} ${clientNom.trim()}`.trim();
      let resolvedClientId = selectedClientId;

      // 1. Si nouveau client ou sans ID, ajout/mise à jour dans la collection clients
      if (!resolvedClientId) {
        // Vérifier si un client avec le même téléphone existe déjà
        const existing = clients.find(c => c.telephone && c.telephone === clientTelephone.trim());
        if (existing) {
          resolvedClientId = existing.id;
          await updateDoc(doc(db, 'clients', existing.id), {
            chiffreAffaires: increment(prixFinalPaye),
            visites: increment(1),
            lastVisit: new Date().toISOString()
          });
        } else {
          const clientRef = await addDoc(collection(db, 'clients'), {
            nom: clientNom.trim(),
            prenom: clientPrenom.trim(),
            telephone: clientTelephone.trim(),
            chiffreAffaires: prixFinalPaye,
            visites: 1,
            lastVisit: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            notes: `Forfait souscrit : ${currentService.nom}`
          });
          resolvedClientId = clientRef.id;
        }
      } else {
        await updateDoc(doc(db, 'clients', resolvedClientId), {
          chiffreAffaires: increment(prixFinalPaye),
          visites: increment(1),
          lastVisit: new Date().toISOString()
        });
      }

      // 2. Synchronisation financière CRITIQUE : UNE SEULE transaction enregistrée
      const txMotif = n === 0
        ? `Abonnement ${currentService.nom} (Carnet 0 séance)`
        : `Abonnement ${currentService.nom} (${n} séance${n > 1 ? 's' : ''})`;

      const txPayload = {
        type: 'prestation',
        montant: Number(prixFinalPaye),
        motif: txMotif,
        clientNom: fullClientName,
        clientId: resolvedClientId,
        clientTel: clientTelephone.trim(),
        employeNom: currentUserNom || 'Système',
        modePaiement: modePaiement,
        date: new Date().toISOString(),
        saisieParNom: currentUserNom || 'Admin',
        isAbonnement: true,
        abonnementServiceNom: currentService.nom,
        abonnementNombreSeances: n
      };
      const txRef = await addDoc(collection(db, 'transactions'), txPayload);

      // 3. Création de l'abonnement immuable
      const nextDate = n > 0 ? computeNextSessionDate(dateDebut, frequence) : null;
      const abonnementPayload = {
        clientId: resolvedClientId,
        clientNom: clientNom.trim(),
        clientPrenom: clientPrenom.trim(),
        clientNomComplet: fullClientName,
        clientTelephone: clientTelephone.trim(),

        serviceId: currentService.id,
        serviceNom: currentService.nom,
        serviceCategorie: currentService.categorie || 'salon',
        prixUnitaire: Number(currentService.prixDefaut || 0), // Immuable

        nombreSeances: n, // N (peut être 0, 1, 2, 3...)
        seancesEffectuees: 0,
        frequence: frequence,
        dateDebut: dateDebut,
        dateFin: dateFin,
        prochaineSeancePrevue: nextDate,

        totalStandard: Number(totalStandard),
        remiseType: remiseType,
        remiseValeur: remiseValeur,
        remiseMontant: Number(remiseMontant),
        prixPaye: Number(prixFinalPaye),

        modePaiement: modePaiement,
        transactionId: txRef.id,
        creePar: currentUserNom || 'Admin',
        createdAt: new Date().toISOString(),
        commentaire: commentaire.trim(),

        statut: 'actif',
        statutHistorique: [
          {
            statut: 'actif',
            date: new Date().toISOString(),
            par: currentUserNom || 'Admin',
            motif: n === 0
              ? 'Souscription initiale du carnet (0 séance configurée)'
              : `Souscription initiale du carnet (${n} séance${n > 1 ? 's' : ''})`
          }
        ],
        seancesConsommees: []
      };

      await addDoc(collection(db, 'abonnements'), abonnementPayload);

      // 4. Audit Log
      await logEvent(
        'ABONNEMENT_CREATE',
        `Souscription forfait [${currentService.nom}] - ${n} séance(s) pour ${prixFinalPaye} FCFA payé via ${modePaiement}. Client : ${fullClientName}`
      );

      // Fermeture & Réinitialisation
      setIsCreateModalOpen(false);
      resetCreateForm();
      setSuccessMessage(`Abonnement créé avec succès (${prixFinalPaye.toLocaleString('fr-FR')} FCFA encaissé)`);
    } catch (err) {
      console.error("[Abonnements] Erreur création :", err);
      alert("Une erreur est survenue lors de la création de l'abonnement.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetCreateForm = () => {
    setIsNewClient(false);
    setSelectedClientId('');
    setClientSearch('');
    setClientNom('');
    setClientPrenom('');
    setClientTelephone('');
    setSelectedServiceId('');
    setNombreSeances(1);
    setFrequence('hebdomadaire');
    setDateDebut(localDateStr());
    setDateFin(computeEndDate(localDateStr(), 1, 'hebdomadaire'));
    setIsDateFinManual(false);
    setRemiseType('aucune');
    setRemiseValeur('');
    setPrixFinalPayeInput('');
    setModePaiement('Cash');
    setCommentaire('');
  };

  // ── Validation d'une Séance (Consommation) ──────────────────────────────────
  const handleOpenConsumeModal = (ab) => {
    if (ab.statut !== 'actif') {
      alert(`Impossible de consommer une séance : cet abonnement est actuellement ${ab.statut.toUpperCase()}.`);
      return;
    }
    const total = Number(ab.nombreSeances !== undefined ? ab.nombreSeances : 0);
    const done = Number(ab.seancesEffectuees || 0);
    if (total === 0) {
      alert("Ce carnet contient actuellement 0 séance. Veuillez paramétrer le carnet pour y ajouter des séances avant de pouvoir valider.");
      return;
    }
    const restant = Math.max(0, total - done);
    if (restant <= 0) {
      alert("Toutes les séances de ce forfait ont déjà été effectuées.");
      return;
    }
    setConsumeModalAbonnement(ab);
    setConsumeEmployeId(employes[0]?.id || '');
    setConsumeDate(localDateStr());
    setConsumeNotes('');
  };

  const handleConfirmConsume = async (e) => {
    e.preventDefault();
    if (isConsuming || !consumeModalAbonnement) return;

    const ab = consumeModalAbonnement;
    const currentDone = Number(ab.seancesEffectuees || 0);
    const maxN = Number(ab.nombreSeances || 0);

    // Garde-fous absolus
    if (currentDone >= maxN) {
      alert("Erreur : le forfait a déjà atteint son nombre maximal de séances.");
      return;
    }
    if (ab.statut !== 'actif') {
      alert("Erreur : l'abonnement n'est pas actif.");
      return;
    }

    setIsConsuming(true);
    try {
      const nextDone = currentDone + 1;
      const isFinished = nextDone >= maxN;
      const newStatus = isFinished ? 'termine' : 'actif';

      const empObj = employes.find(e => e.id === consumeEmployeId);
      const praticienNom = empObj ? empObj.nom : (currentUserNom || 'Équipe Le Cercle');

      const nextPlanned = isFinished
        ? null
        : computeNextSessionDate(consumeDate, ab.frequence);

      const seanceRecord = {
        numero: nextDone,
        date: new Date().toISOString(),
        dateSeance: consumeDate,
        effectuePar: praticienNom,
        notes: consumeNotes.trim()
      };

      const updatePayload = {
        seancesEffectuees: nextDone,
        statut: newStatus,
        prochaineSeancePrevue: nextPlanned,
        lastConsommationDate: new Date().toISOString(),
        seancesConsommees: arrayUnion(seanceRecord)
      };

      if (isFinished) {
        updatePayload.statutHistorique = arrayUnion({
          statut: 'termine',
          date: new Date().toISOString(),
          par: currentUserNom || 'Système',
          motif: 'Toutes les séances du forfait ont été effectuées'
        });
      }

      await updateDoc(doc(db, 'abonnements', ab.id), updatePayload);

      // Audit Log : AUCUNE transaction financière créée
      await logEvent(
        'ABONNEMENT_CONSOMMATION',
        `Séance ${nextDone}/${maxN} effectuée pour abonnement [${ab.serviceNom}] (Client : ${ab.clientNomComplet}). Praticien : ${praticienNom}.`
      );

      // Mettre à jour la vue détaillée si ouverte
      if (selectedAbonnement && selectedAbonnement.id === ab.id) {
        setSelectedAbonnement(prev => ({
          ...prev,
          seancesEffectuees: nextDone,
          statut: newStatus,
          prochaineSeancePrevue: nextPlanned,
          seancesConsommees: [...(prev.seancesConsommees || []), seanceRecord]
        }));
      }

      setConsumeModalAbonnement(null);
      setSuccessMessage(
        isFinished
          ? `Dernière séance (${nextDone}/${maxN}) validée. Forfait terminé !`
          : `Séance ${nextDone}/${maxN} validée avec succès.`
      );
    } catch (err) {
      console.error("[Abonnements] Erreur consommation séance :", err);
      alert("Une erreur est survenue lors de la validation de la séance.");
    } finally {
      setIsConsuming(false);
    }
  };

  // ── Changement de Statut (Suspendre / Réactiver / Annuler) ──────────────────
  const handleOpenStatusModal = (ab, targetStatus) => {
    setStatusChangeModal({ abonnement: ab, targetStatus });
    setStatusMotif('');
  };

  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!statusChangeModal) return;

    const { abonnement, targetStatus } = statusChangeModal;
    try {
      const statusRecord = {
        statut: targetStatus,
        date: new Date().toISOString(),
        par: currentUserNom || 'Admin',
        motif: statusMotif.trim() || 'Modification administrative'
      };

      await updateDoc(doc(db, 'abonnements', abonnement.id), {
        statut: targetStatus,
        statutHistorique: arrayUnion(statusRecord)
      });

      await logEvent(
        'ABONNEMENT_STATUS_CHANGE',
        `Abonnement [${abonnement.serviceNom}] (Client : ${abonnement.clientNomComplet}) passé au statut ${targetStatus.toUpperCase()}. Motif : ${statusMotif.trim() || 'Non spécifié'}`
      );

      if (selectedAbonnement && selectedAbonnement.id === abonnement.id) {
        setSelectedAbonnement(prev => ({
          ...prev,
          statut: targetStatus,
          statutHistorique: [...(prev.statutHistorique || []), statusRecord]
        }));
      }

      setStatusChangeModal(null);
      setSuccessMessage(`Statut mis à jour : ${targetStatus.toUpperCase()}`);
    } catch (err) {
      console.error("[Abonnements] Erreur changement statut :", err);
      alert("Une erreur est survenue lors de la mise à jour du statut.");
    }
  };

  // ── Paramétrage du Carnet de Séances (Contrôle Absolu) ─────────────────────
  const handleOpenEditCarnet = (ab) => {
    setEditCarnetModal(ab);
    setEditCarnetNbSeances(ab.nombreSeances !== undefined ? ab.nombreSeances : 0);
    setEditCarnetDoneSeances(ab.seancesEffectuees || 0);
    setEditCarnetFrequence(ab.frequence || 'hebdomadaire');
    setEditCarnetDateFin(ab.dateFin || localDateStr());
    setEditCarnetStatut(ab.statut || 'actif');
    setEditCarnetMotif('');
  };

  const handleConfirmEditCarnet = async (e) => {
    e.preventDefault();
    if (isSavingCarnet || !editCarnetModal) return;

    const totalN = editCarnetNbSeances === '' ? 0 : parseInt(editCarnetNbSeances, 10);
    const doneN = editCarnetDoneSeances === '' ? 0 : parseInt(editCarnetDoneSeances, 10);

    if (isNaN(totalN) || totalN < 0) {
      alert("Veuillez saisir un nombre total de séances valide (0 ou supérieur).");
      return;
    }
    if (isNaN(doneN) || doneN < 0) {
      alert("Veuillez saisir un nombre de séances effectuées valide (0 ou supérieur).");
      return;
    }
    if (totalN > 0 && doneN > totalN) {
      alert("Le nombre de séances effectuées ne peut pas dépasser le nombre total de séances du carnet.");
      return;
    }

    setIsSavingCarnet(true);
    try {
      const ab = editCarnetModal;
      let finalStatus = editCarnetStatut;

      // Déduction intelligente du statut
      if (totalN > 0 && doneN >= totalN && finalStatus === 'actif') {
        finalStatus = 'termine';
      } else if (doneN < totalN && finalStatus === 'termine') {
        finalStatus = 'actif';
      }

      const nextPlanned = (totalN > doneN && finalStatus === 'actif')
        ? computeNextSessionDate(localDateStr(), editCarnetFrequence)
        : null;

      const carnetRecord = {
        statut: finalStatus,
        date: new Date().toISOString(),
        par: currentUserNom || 'Admin',
        motif: editCarnetMotif.trim() || `Paramétrage carnet : ${totalN} séance(s) totale(s), ${doneN} effectuée(s) (Fréquence : ${editCarnetFrequence})`
      };

      const updateData = {
        nombreSeances: totalN,
        seancesEffectuees: doneN,
        frequence: editCarnetFrequence,
        dateFin: editCarnetDateFin,
        statut: finalStatus,
        prochaineSeancePrevue: nextPlanned,
        statutHistorique: arrayUnion(carnetRecord)
      };

      await updateDoc(doc(db, 'abonnements', ab.id), updateData);

      await logEvent(
        'ABONNEMENT_PARAMETRAGE_CARNET',
        `Ajustement du carnet de séances pour [${ab.serviceNom}] (Client : ${ab.clientNomComplet}) : N=${totalN}, Effectuées=${doneN}, Statut=${finalStatus}. Motif : ${editCarnetMotif.trim() || 'Paramétrage manuel'}`
      );

      if (selectedAbonnement && selectedAbonnement.id === ab.id) {
        setSelectedAbonnement(prev => ({
          ...prev,
          ...updateData,
          statutHistorique: [...(prev.statutHistorique || []), carnetRecord]
        }));
      }

      setEditCarnetModal(null);
      setSuccessMessage(`Carnet de séances reconfiguré : ${totalN} séance${totalN > 1 ? 's' : ''} (${doneN} effectuée${doneN > 1 ? 's' : ''})`);
    } catch (err) {
      console.error("[Abonnements] Erreur paramétrage carnet :", err);
      alert("Une erreur est survenue lors du paramétrage du carnet de séances.");
    } finally {
      setIsSavingCarnet(false);
    }
  };

  return (
    <div className="view-container">
      {/* ── EN-TÊTE DU MODULE ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            color: 'var(--text-main)',
            letterSpacing: '-0.02em',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Repeat size={24} color="var(--accent-color)" />
            Abonnements &amp; Forfaits Prépayés
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Vente de carnets de séances, suivi des consommations et planification des soins du salon.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetCreateForm();
            setIsCreateModalOpen(true);
          }}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.88rem',
            fontWeight: 700,
            borderRadius: '10px'
          }}
        >
          <PlusCircle size={17} /> Nouvel Abonnement
        </button>
      </div>

      {/* ── CARTES KPIS EN-TÊTE ──────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {/* 1. Actifs */}
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Abonnements Actifs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
            {stats.actifs}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Sur {stats.total} forfait{stats.total > 1 ? 's' : ''} au total
          </div>
        </div>

        {/* 2. Séances Restantes Globales */}
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Séances Restantes
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--accent-color)', marginTop: '4px' }}>
            {stats.seancesRestantes}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            À consommer au salon
          </div>
        </div>

        {/* 3. Terminés */}
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Forfaits Terminés
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '4px' }}>
            {stats.termines}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Séances 100% consommées
          </div>
        </div>

        {/* 4. Expirations Proches */}
        <div className="card" style={{
          marginBottom: 0,
          padding: '14px 16px',
          border: stats.expirationsProches > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : undefined,
          backgroundColor: stats.expirationsProches > 0 ? 'rgba(239, 68, 68, 0.04)' : undefined
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: stats.expirationsProches > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            Expirations Proches
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: stats.expirationsProches > 0 ? 'var(--danger)' : 'var(--text-main)', marginTop: '4px' }}>
            {stats.expirationsProches}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Dans les 7 jours
          </div>
        </div>

        {/* 5. Chiffre d'Affaires Total */}
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            CA Forfaits Encaissé
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>
            {stats.caTotal.toLocaleString('fr-FR')} F
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Comptabilisé en caisse
          </div>
        </div>
      </div>

      {/* ── BANDEAU DE RAPPELS ET ALERTES INTERNES IN-APP ──────────────────── */}
      {(stats.uneSeanceRestante > 0 || stats.expirationsProches > 0) && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              Rappels Internes :
            </span>

            {stats.uneSeanceRestante > 0 && (
              <button
                type="button"
                onClick={() => setFilterStatut('une_seance')}
                className="btn btn-small"
                style={{
                  fontSize: '0.76rem',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  color: '#d97706',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontWeight: 700
                }}
              >
                {stats.uneSeanceRestante} forfait(s) avec 1 seule séance restante (Proposer renouvellement)
              </button>
            )}

            {stats.expirationsProches > 0 && (
              <button
                type="button"
                onClick={() => setFilterStatut('expirant_bientot')}
                className="btn btn-small"
                style={{
                  fontSize: '0.76rem',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontWeight: 700
                }}
              >
                {stats.expirationsProches} forfait(s) expirant sous 7 jours
              </button>
            )}
          </div>

          {filterStatut !== 'tous' && (
            <button
              type="button"
              onClick={() => setFilterStatut('tous')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Afficher tous les abonnements
            </button>
          )}
        </div>
      )}

      {/* ── BARRE DE FILTRES ET RECHERCHE ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '18px', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Recherche */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-control"
              style={{ margin: 0, paddingLeft: '36px' }}
              placeholder="Rechercher par client, téléphone ou service..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Onglets de Statut */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'tous', label: 'Tous' },
              { id: 'actif', label: `Actifs (${stats.actifs})` },
              { id: 'termine', label: `Terminés (${stats.termines})` },
              { id: 'suspendu', label: `Suspendus (${stats.suspendus})` },
              { id: 'annule', label: `Annulés (${stats.annules})` },
              { id: 'expirant_bientot', label: 'Expirant bientôt' },
              { id: 'une_seance', label: '1 séance restante' }
            ].map(f => {
              const isSel = filterStatut === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterStatut(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: isSel ? 700 : 500,
                    cursor: 'pointer',
                    backgroundColor: isSel ? 'var(--btn-primary-bg)' : 'var(--bg-input)',
                    color: isSel ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── LISTE DES ABONNEMENTS (TABLEAU DESKTOP + CARTES MOBILE) ──────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredAbonnements.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Repeat size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Aucun abonnement trouvé</div>
            <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              {searchTerm || filterStatut !== 'tous'
                ? "Aucun résultat ne correspond aux filtres appliqués."
                : "Commencez par créer le premier abonnement forfaitaire pour vos clients."}
            </div>
          </div>
        ) : (
          <>
            {/* VUE TABLEAU (DESKTOP) */}
            <div className="desktop-table table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Client</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>Forfait Prestation</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>Progression</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>Montant Payé</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>Date Fin &amp; Prochaine</th>
                    <th style={{ padding: '12px 14px', fontWeight: 700 }}>Statut</th>
                    <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAbonnements.map(ab => {
                    const done = Number(ab.seancesEffectuees || 0);
                    const total = Number(ab.nombreSeances !== undefined ? ab.nombreSeances : 0);
                    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                    const restant = Math.max(0, total - done);
                    const isExpiring = ab.statut === 'actif' && ab.dateFin && ab.dateFin <= localDateStr();

                    return (
                      <tr
                        key={ab.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        {/* Client */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {ab.clientNomComplet || `${ab.clientPrenom || ''} ${ab.clientNom || ''}`.trim() || 'Client de passage'}
                          </div>
                          {ab.clientTelephone && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {ab.clientTelephone}
                            </div>
                          )}
                        </td>

                        {/* Forfait / Service */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {ab.serviceNom}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'capitalize' }}>
                            Fréquence : {ab.frequence || 'Hebdomadaire'}
                          </div>
                        </td>

                        {/* Progression */}
                        <td style={{ padding: '12px 14px', minWidth: '160px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, color: total > 0 && done >= total ? '#10b981' : 'var(--text-main)' }}>
                              {done} / {total} séance{total > 1 ? 's' : ''}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {total === 0 ? 'Carnet 0 séance' : restant > 0 ? `${restant} restante${restant > 1 ? 's' : ''}` : 'Terminé'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                backgroundColor: total > 0 && done >= total ? '#10b981' : 'var(--accent-color)',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>
                        </td>

                        {/* Montant Payé */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                            {Number(ab.prixPaye || 0).toLocaleString('fr-FR')} FCFA
                          </div>
                          {Number(ab.remiseMontant || 0) > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>
                              Économie : –{Number(ab.remiseMontant).toLocaleString('fr-FR')} F
                            </div>
                          )}
                        </td>

                        {/* Échéances */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '0.78rem', color: isExpiring ? 'var(--danger)' : 'var(--text-main)', fontWeight: isExpiring ? 700 : 500 }}>
                            Fin : {formatDateFr(ab.dateFin)}
                          </div>
                          {ab.prochaineSeancePrevue && ab.statut === 'actif' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Prochaine : {formatDateFr(ab.prochaineSeancePrevue)}
                            </div>
                          )}
                        </td>

                        {/* Statut */}
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              letterSpacing: '0.5px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              textTransform: 'uppercase',
                              backgroundColor:
                                ab.statut === 'actif'
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : ab.statut === 'termine'
                                    ? 'var(--bg-input)'
                                    : ab.statut === 'suspendu'
                                      ? 'rgba(245, 158, 11, 0.12)'
                                      : 'rgba(239, 68, 68, 0.12)',
                              color:
                                ab.statut === 'actif'
                                  ? '#10b981'
                                  : ab.statut === 'termine'
                                    ? 'var(--text-muted)'
                                    : ab.statut === 'suspendu'
                                      ? '#d97706'
                                      : 'var(--danger)',
                              border:
                                ab.statut === 'actif'
                                  ? '1px solid rgba(16, 185, 129, 0.3)'
                                  : '1px solid var(--border-color)'
                            }}
                          >
                            {ab.statut}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {ab.statut === 'actif' && restant > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenConsumeModal(ab)}
                                className="btn btn-small"
                                style={{
                                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                  color: '#047857',
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  fontWeight: 700,
                                  fontSize: '0.74rem',
                                  padding: '5px 9px',
                                  borderRadius: '6px'
                                }}
                                title="Marquer une séance comme effectuée"
                              >
                                +1 Séance
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenEditCarnet(ab)}
                              className="btn btn-small"
                              style={{
                                backgroundColor: 'var(--bg-input)',
                                color: 'var(--text-main)',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.74rem',
                                padding: '5px 9px',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Paramétrer le carnet de séances"
                            >
                              <SlidersHorizontal size={13} /> Carnet
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedAbonnement(ab)}
                              className="btn btn-small"
                              style={{
                                backgroundColor: 'var(--bg-input)',
                                color: 'var(--text-main)',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.74rem',
                                padding: '5px 9px',
                                borderRadius: '6px'
                              }}
                            >
                              Détails
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* VUE CARTES (MOBILE) */}
            <div className="mobile-cards" style={{ padding: '12px' }}>
              {filteredAbonnements.map(ab => {
                const done = Number(ab.seancesEffectuees || 0);
                const total = Number(ab.nombreSeances !== undefined ? ab.nombreSeances : 0);
                const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                const restant = Math.max(0, total - done);

                return (
                  <div
                    key={ab.id}
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--text-main)' }}>
                          {ab.clientNomComplet || 'Client'}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {ab.clientTelephone || 'Téléphone non renseigné'}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                          backgroundColor:
                            ab.statut === 'actif'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : ab.statut === 'termine'
                                ? 'var(--bg-input)'
                                : 'rgba(239, 68, 68, 0.12)',
                          color:
                            ab.statut === 'actif'
                              ? '#10b981'
                              : ab.statut === 'termine'
                                ? 'var(--text-muted)'
                                : 'var(--danger)'
                        }}
                      >
                        {ab.statut}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {ab.serviceNom}
                    </div>

                    {/* Barre de progression */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 700 }}>{done}/{total} séance{total > 1 ? 's' : ''}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {total === 0 ? 'Carnet 0 séance' : `${restant} restante${restant > 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: total > 0 && done >= total ? '#10b981' : 'var(--accent-color)' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      <span>Payé : <strong style={{ color: 'var(--text-main)' }}>{Number(ab.prixPaye || 0).toLocaleString('fr-FR')} F</strong></span>
                      <span>Fin : {formatDateFr(ab.dateFin)}</span>
                    </div>

                    {/* Boutons actions mobile */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {ab.statut === 'actif' && restant > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenConsumeModal(ab)}
                          className="btn btn-small"
                          style={{
                            flex: 1,
                            minWidth: '110px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#047857',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            fontWeight: 700,
                            padding: '8px'
                          }}
                        >
                          +1 Séance
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEditCarnet(ab)}
                        className="btn btn-small"
                        style={{
                          flex: 1,
                          minWidth: '100px',
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          padding: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <SlidersHorizontal size={14} /> Carnet
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAbonnement(ab)}
                        className="btn btn-small"
                        style={{
                          flex: 1,
                          minWidth: '90px',
                          backgroundColor: 'var(--bg-input)',
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          padding: '8px'
                        }}
                      >
                        Détails
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 1 : CRÉATION D'UN NOUVEL ABONNEMENT
          ════════════════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
            <div
              className="modal-content"
              style={{
                maxWidth: '680px',
                width: '95vw',
                maxHeight: '92vh',
                overflowY: 'auto',
                padding: '24px'
              }}
              onClick={e => e.stopPropagation()}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Repeat size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Souscrire un Forfait Abonnement</h3>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Paiement comptant d'un carnet de séances avec synchronisation financière directe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAbonnement}>
              {/* SECTION 1 : CLIENT */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    1. Client bénéficiaire
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewClient(!isNewClient);
                      setSelectedClientId('');
                      setClientNom('');
                      setClientPrenom('');
                      setClientTelephone('');
                      setClientSearch('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    {isNewClient ? "Choisir un client existant" : "+ Créer un nouveau client"}
                  </button>
                </div>

                {!isNewClient ? (
                  <div>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Tapez pour rechercher un client par nom ou tél..."
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setSelectedClientId('');
                      }}
                    />
                    {clientSearch && !selectedClientId && filteredClients.length > 0 && (
                      <div style={{
                        maxHeight: '160px',
                        overflowY: 'auto',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-card)',
                        marginTop: '-6px',
                        marginBottom: '10px'
                      }}>
                        {filteredClients.map(c => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectClient(c)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: '0.84rem'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--bg-input)'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <strong>{c.prenom} {c.nom}</strong> — {c.telephone || 'Sans tél.'}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedClientId && (
                      <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>
                        Client sélectionné : {clientPrenom} {clientNom} ({clientTelephone || 'Sans tél.'})
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-grid-client">
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nom</label>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Ex: Diallo"
                        value={clientNom}
                        onChange={e => setClientNom(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Prénom</label>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Ex: Mariama"
                        value={clientPrenom}
                        onChange={e => setClientPrenom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Téléphone</label>
                      <input
                        type="tel"
                        className="input-control"
                        placeholder="Ex: +227 90 00 00 00"
                        value={clientTelephone}
                        onChange={e => setClientTelephone(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2 : PRESTATION / SERVICE */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  2. Prestation incluse dans le forfait
                </label>
                <select
                  className="input-control"
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  required
                >
                  <option value="">-- Choisir une prestation --</option>
                  {services
                    .filter(s => !isBeverageService(s))
                    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }))
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nom} — Tarif unitaire : {Number(s.prixDefaut || 0).toLocaleString('fr-FR')} FCFA
                      </option>
                    ))}
                </select>
                {currentService && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Tarif unitaire catalogué : <strong>{Number(currentService.prixDefaut || 0).toLocaleString('fr-FR')} FCFA</strong> (sera figé dans l'abonnement).
                  </div>
                )}
              </div>

              {/* SECTION 3 : PARAMÈTRES DU FORFAIT */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  3. Paramètres du carnet de séances
                </label>

                <div className="form-grid-carnet">
                  <div className="form-grid-dates">
                    {/* Nombre de séances N (Saisie libre et absolue : 0, 1, 2, 3...) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nombre de séances (N)</label>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Saisie libre (0, 1, 2, 3...)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const curr = nombreSeances === '' ? 0 : Number(nombreSeances);
                            handleNombreSeancesChange(Math.max(0, curr - 1));
                          }}
                          className="btn btn-small"
                          style={{
                            padding: '6px 12px',
                            fontWeight: 800,
                            fontSize: '1rem',
                            backgroundColor: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px'
                          }}
                          title="Diminuer d'une séance"
                        >
                          –
                        </button>
                        <input
                          type="number"
                          min="0"
                          className="input-control"
                          style={{ textAlign: 'center', fontWeight: 800, fontSize: '1rem', padding: '6px' }}
                          value={nombreSeances}
                          onChange={e => handleNombreSeancesChange(e.target.value)}
                          placeholder="0"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const curr = nombreSeances === '' ? 0 : Number(nombreSeances);
                            handleNombreSeancesChange(curr + 1);
                          }}
                          className="btn btn-small"
                          style={{
                            padding: '6px 12px',
                            fontWeight: 800,
                            fontSize: '1rem',
                            backgroundColor: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px'
                          }}
                          title="Ajouter une séance"
                        >
                          +
                        </button>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {nombreSeances === '' || Number(nombreSeances) === 0
                          ? "Carnet vierge à 0 séance (ajustable à tout moment)"
                          : `${nombreSeances} séance${Number(nombreSeances) > 1 ? 's' : ''} au total dans le carnet`}
                      </div>
                    </div>

                    {/* Fréquence */}
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Fréquence des séances</label>
                      <select
                        className="input-control"
                        value={frequence}
                        onChange={e => handleFrequenceChange(e.target.value)}
                      >
                        <option value="hebdomadaire">Hebdomadaire (1 séance / sem.)</option>
                        <option value="bimensuelle">Bimensuelle (1 séance / 2 sem.)</option>
                        <option value="mensuelle">Mensuelle (1 séance / mois)</option>
                        <option value="personnalisee">Personnalisée (au choix)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-grid-dates">
                    {/* Date Début */}
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Date de début</label>
                      <input
                        type="date"
                        className="input-control"
                        value={dateDebut}
                        onChange={e => handleDateDebutChange(e.target.value)}
                        required
                      />
                    </div>

                    {/* Date Fin */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Date d'expiration</label>
                        <button
                          type="button"
                          onClick={handleToggleDateFinManual}
                          style={{ background: 'none', border: 'none', fontSize: '0.68rem', color: 'var(--accent-color)', cursor: 'pointer' }}
                        >
                          {isDateFinManual ? "Auto" : "Personnaliser"}
                        </button>
                      </div>
                      <input
                        type="date"
                        className="input-control"
                        value={dateFin}
                        onChange={e => {
                          setDateFin(e.target.value);
                          setIsDateFinManual(true);
                        }}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4 : TARIFICATION & RÉDUCTION */}
              <div style={{
                backgroundColor: 'var(--bg-input)',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '16px',
                border: '1px solid var(--border-color)'
              }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  4. Tarification &amp; Réduction forfaitaire
                </label>

                <div className="form-grid-tarification">
                  {/* Type remise */}
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Type de réduction</label>
                    <select
                      className="input-control"
                      value={remiseType}
                      onChange={e => setRemiseType(e.target.value)}
                    >
                      <option value="aucune">Aucune réduction</option>
                      <option value="pourcentage">Pourcentage (%)</option>
                      <option value="fixe">Montant fixe (FCFA)</option>
                      <option value="manuel">Saisie manuelle du prix payé</option>
                    </select>
                  </div>

                  {/* Valeur remise */}
                  {remiseType !== 'aucune' && remiseType !== 'manuel' && (
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {remiseType === 'pourcentage' ? 'Pourcentage (%)' : 'Montant déduit (FCFA)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input-control"
                        placeholder={remiseType === 'pourcentage' ? 'Ex: 10' : 'Ex: 5000'}
                        value={remiseValeur}
                        onChange={e => setRemiseValeur(e.target.value)}
                      />
                    </div>
                  )}

                  {remiseType === 'manuel' && (
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Prix final réellement payé (FCFA)</label>
                      <input
                        type="number"
                        min="0"
                        className="input-control"
                        placeholder="Ex: 50000"
                        value={prixFinalPayeInput}
                        onChange={e => setPrixFinalPayeInput(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {/* Mode Paiement */}
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Mode de règlement</label>
                    <select
                      className="input-control"
                      value={modePaiement}
                      onChange={e => setModePaiement(e.target.value)}
                    >
                      <option value="Cash">Cash (Espèces)</option>
                      <option value="Carte VISA">Carte VISA</option>
                      <option value="NITA">NITA</option>
                      <option value="AMANA">AMANA</option>
                    </select>
                  </div>
                </div>

                {/* Synthèse financière de validation */}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px dashed var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Total standard : <span style={{ textDecoration: remiseMontant > 0 ? 'line-through' : 'none' }}>{totalStandard.toLocaleString('fr-FR')} FCFA</span>
                    {remiseMontant > 0 && (
                      <span style={{ color: '#10b981', marginLeft: '6px' }}>
                        (–{remiseMontant.toLocaleString('fr-FR')} F)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-color)' }}>
                    À encaisser : {prixFinalPaye.toLocaleString('fr-FR')} FCFA
                  </div>
                </div>
              </div>

              {/* SECTION 5 : COMMENTAIRE */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Commentaire / Observations (Optionnel)</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Préférence horaires matinée, cliente VIP..."
                  value={commentaire}
                  onChange={e => setCommentaire(e.target.value)}
                />
              </div>

              {/* RÈGLE CRITIQUE D'INFORMATION FINANCIÈRE */}
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginBottom: '18px',
                lineHeight: 1.4
              }}>
                <strong style={{ color: 'var(--accent-color)' }}>Règle de synchronisation financière :</strong> Une seule transaction de <strong>{prixFinalPaye.toLocaleString('fr-FR')} FCFA</strong> sera immédiatement enregistrée dans la caisse du jour. La consommation des {nombreSeances === '' ? 0 : nombreSeances} séances futures n'engendrera aucun doublon financier.
              </div>

              {/* ACTIONS MODAL */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  disabled={isSaving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving || !selectedServiceId}
                  style={{ fontWeight: 800, padding: '10px 20px' }}
                >
                  {isSaving ? "Enregistrement en cours..." : `Encaisser & Valider l'Abonnement (${prixFinalPaye.toLocaleString('fr-FR')} F)`}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 2 : VALIDATION D'UNE SÉANCE (« MARQUER COMME EFFECTUÉE »)
          ════════════════════════════════════════════════════════════════════ */}
      {consumeModalAbonnement && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setConsumeModalAbonnement(null)}>
            <div
              className="modal-content"
              style={{ maxWidth: '480px', width: '92vw', padding: '22px' }}
              onClick={e => e.stopPropagation()}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Valider une Séance</h3>
              </div>
              <button
                type="button"
                onClick={() => setConsumeModalAbonnement(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmConsume}>
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Client :</div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                  {consumeModalAbonnement.clientNomComplet}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Prestation :</div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--accent-color)' }}>
                  {consumeModalAbonnement.serviceNom}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-main)' }}>
                  Validation : <strong>Séance {(consumeModalAbonnement.seancesEffectuees || 0) + 1} sur {consumeModalAbonnement.nombreSeances}</strong>
                </div>
              </div>

              {/* Choix Praticien */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Praticien ayant réalisé le soin
                </label>
                <select
                  className="input-control"
                  value={consumeEmployeId}
                  onChange={e => setConsumeEmployeId(e.target.value)}
                  required
                >
                  {employes.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nom}</option>
                  ))}
                </select>
              </div>

              {/* Date de la séance */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Date d'exécution
                </label>
                <input
                  type="date"
                  className="input-control"
                  value={consumeDate}
                  onChange={e => setConsumeDate(e.target.value)}
                  required
                />
              </div>

              {/* Notes de séance */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Notes de la séance (Optionnel)
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Soin complet réalisé, peau bien hydratée..."
                  value={consumeNotes}
                  onChange={e => setConsumeNotes(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic' }}>
                Rappel : La validation de cette séance n'affecte pas la comptabilité financière (déjà enregistrée lors de la souscription).
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setConsumeModalAbonnement(null)}
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  disabled={isConsuming}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#10b981', color: '#fff', fontWeight: 800 }}
                  disabled={isConsuming}
                >
                  {isConsuming ? "Validation..." : "Confirmer la séance effectuée"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 3 : VUE DÉTAILLÉE DE L'ABONNEMENT
          ════════════════════════════════════════════════════════════════════ */}
      {selectedAbonnement && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setSelectedAbonnement(null)}>
            <div
              className="modal-content"
              style={{
                maxWidth: '680px',
                width: '95vw',
                maxHeight: '92vh',
                overflowY: 'auto',
                padding: '24px'
              }}
              onClick={e => e.stopPropagation()}
            >
            {/* En-tête détaillée */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    textTransform: 'uppercase',
                    backgroundColor:
                      selectedAbonnement.statut === 'actif'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : selectedAbonnement.statut === 'termine'
                          ? 'var(--bg-input)'
                          : 'rgba(239, 68, 68, 0.12)',
                    color:
                      selectedAbonnement.statut === 'actif'
                        ? '#10b981'
                        : selectedAbonnement.statut === 'termine'
                          ? 'var(--text-muted)'
                          : 'var(--danger)',
                    display: 'inline-block',
                    marginBottom: '6px'
                  }}
                >
                  {selectedAbonnement.statut}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                  {selectedAbonnement.serviceNom}
                </h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Client : <strong style={{ color: 'var(--text-main)' }}>{selectedAbonnement.clientNomComplet}</strong>
                  {selectedAbonnement.clientTelephone && ` • Tél. ${selectedAbonnement.clientTelephone}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleOpenEditCarnet(selectedAbonnement)}
                  className="btn btn-small"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                  title="Paramétrer le carnet de séances"
                >
                  <SlidersHorizontal size={14} color="var(--accent-color)" /> Paramétrer le carnet
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAbonnement(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Jauge de progression */}
            {(() => {
              const selDone = Number(selectedAbonnement.seancesEffectuees || 0);
              const selTotal = Number(selectedAbonnement.nombreSeances !== undefined ? selectedAbonnement.nombreSeances : 0);
              const selPct = selTotal > 0 ? Math.min(100, Math.round((selDone / selTotal) * 100)) : 0;
              const selRestant = Math.max(0, selTotal - selDone);

              return (
                <div style={{ backgroundColor: 'var(--bg-input)', padding: '14px 16px', borderRadius: '12px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      Progression du forfait : {selDone} / {selTotal} séance{selTotal > 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: selTotal > 0 && selDone >= selTotal ? '#10b981' : 'var(--accent-color)' }}>
                      {selPct}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '6px', backgroundColor: 'var(--bg-card)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${selPct}%`,
                        height: '100%',
                        backgroundColor: selTotal > 0 && selDone >= selTotal ? '#10b981' : 'var(--accent-color)',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    <span>Restantes : <strong>{selTotal === 0 ? '0 (Carnet 0 séance)' : selRestant}</strong></span>
                    <span>Validité : {formatDateFr(selectedAbonnement.dateDebut)} → {formatDateFr(selectedAbonnement.dateFin)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Récapitulatif Financier Immuable */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Prix unitaire figé</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px' }}>
                  {Number(selectedAbonnement.prixUnitaire || 0).toLocaleString('fr-FR')} F
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total standard</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px' }}>
                  {Number(selectedAbonnement.totalStandard || 0).toLocaleString('fr-FR')} F
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Réduction accordée</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                  –{Number(selectedAbonnement.remiseMontant || 0).toLocaleString('fr-FR')} F
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Encaissé</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--accent-color)', marginTop: '2px' }}>
                  {Number(selectedAbonnement.prixPaye || 0).toLocaleString('fr-FR')} F
                </div>
              </div>
            </div>

            {/* Calendrier Prévisionnel des Séances */}
            {(() => {
              const selDone = Number(selectedAbonnement.seancesEffectuees || 0);
              const selTotal = Number(selectedAbonnement.nombreSeances !== undefined ? selectedAbonnement.nombreSeances : 0);

              return (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Calendrier Prévisionnel &amp; Fréquence ({selectedAbonnement.frequence || 'Hebdomadaire'})
                  </h4>
                  {selTotal === 0 ? (
                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                      Carnet configuré à 0 séance. Cliquez sur « Paramétrer le carnet » pour définir ou créditer des séances.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
                      {Array.from({ length: selTotal }).map((_, i) => {
                        const num = i + 1;
                        const isDone = num <= selDone;
                        const isNext = num === selDone + 1;

                        return (
                          <div
                            key={num}
                            style={{
                              flex: '0 0 auto',
                              minWidth: '90px',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              textAlign: 'center',
                              backgroundColor: isDone
                                ? 'rgba(16, 185, 129, 0.12)'
                                : isNext
                                  ? 'rgba(59, 130, 246, 0.12)'
                                  : 'var(--bg-input)',
                              border: isDone
                                ? '1px solid rgba(16, 185, 129, 0.35)'
                                : isNext
                                  ? '1px solid var(--accent-color)'
                                  : '1px solid var(--border-color)'
                            }}
                          >
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isDone ? '#10b981' : isNext ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                              Séance {num}
                            </div>
                            <div style={{ fontSize: '0.68rem', marginTop: '3px', fontWeight: 600 }}>
                              {isDone ? "Effectuée" : isNext ? "Prochaine" : "À venir"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Historique daté des séances consommées */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                  Historique Daté des Séances Consommées
                </h4>
                {selectedAbonnement.statut === 'actif' && (Number(selectedAbonnement.nombreSeances || 0) > Number(selectedAbonnement.seancesEffectuees || 0)) && (
                  <button
                    type="button"
                    onClick={() => handleOpenConsumeModal(selectedAbonnement)}
                    className="btn btn-small"
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#047857',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      padding: '4px 10px'
                    }}
                  >
                    + Valider Séance {Number(selectedAbonnement.seancesEffectuees || 0) + 1}
                  </button>
                )}
              </div>

              {(!selectedAbonnement.seancesConsommees || selectedAbonnement.seancesConsommees.length === 0) ? (
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Aucune séance n'a encore été consommée sur ce forfait.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedAbonnement.seancesConsommees.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                          Séance {s.numero || idx + 1}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Praticien : <strong>{s.effectuePar || 'Équipe Le Cercle'}</strong>
                          {s.notes && ` — « ${s.notes} »`}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {formatDateTimeFr(s.date || s.dateSeance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions de gestion du cycle de vie */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedAbonnement.statut === 'actif' && (
                  <button
                    type="button"
                    onClick={() => handleOpenStatusModal(selectedAbonnement, 'suspendu')}
                    className="btn btn-small"
                    style={{ fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                  >
                    Suspendre
                  </button>
                )}
                {selectedAbonnement.statut === 'suspendu' && (
                  <button
                    type="button"
                    onClick={() => handleOpenStatusModal(selectedAbonnement, 'actif')}
                    className="btn btn-small"
                    style={{ fontSize: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#047857', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                  >
                    Réactiver
                  </button>
                )}
                {selectedAbonnement.statut !== 'annule' && (
                  <button
                    type="button"
                    onClick={() => handleOpenStatusModal(selectedAbonnement, 'annule')}
                    className="btn btn-small"
                    style={{ fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  >
                    Annuler le forfait
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedAbonnement(null)}
                className="btn"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '6px 14px', fontSize: '0.8rem' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 4 : CHANGEMENT DE STATUT (SUSPENDRE / RÉACTIVER / ANNULER)
          ════════════════════════════════════════════════════════════════════ */}
      {statusChangeModal && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setStatusChangeModal(null)}>
            <div
              className="modal-content"
              style={{ maxWidth: '440px', width: '90vw', padding: '20px' }}
              onClick={e => e.stopPropagation()}
            >
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 800 }}>
              Confirmer le statut : {statusChangeModal.targetStatus.toUpperCase()}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Vous êtes sur le point de passer l'abonnement de <strong>{statusChangeModal.abonnement.clientNomComplet}</strong> au statut <strong>{statusChangeModal.targetStatus}</strong>.
              <br /><br />
              <em>Note de sécurité : L'encaissement financier initial reste consigné en caisse et ne sera pas supprimé.</em>
            </p>

            <form onSubmit={handleConfirmStatusChange}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Motif de la modification (Optionnel)
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Demande cliente pour voyage, raison médicale..."
                  value={statusMotif}
                  onChange={e => setStatusMotif(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setStatusChangeModal(null)}
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    backgroundColor: statusChangeModal.targetStatus === 'annule' ? 'var(--danger)' : undefined
                  }}
                >
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL 5 : PARAMÉTRAGE DU CARNET DE SÉANCES (CONTRÔLE ABSOLU)
          ════════════════════════════════════════════════════════════════════ */}
      {editCarnetModal && (
        <ModalPortal>
          <div className="modal-overlay" onClick={() => setEditCarnetModal(null)}>
            <div
              className="modal-content"
              style={{ maxWidth: '520px', width: '92vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
              onClick={e => e.stopPropagation()}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SlidersHorizontal size={18} color="var(--accent-color)" />
                  Paramétrer le carnet de séances
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {editCarnetModal.clientNomComplet} • {editCarnetModal.serviceNom}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditCarnetModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmEditCarnet}>
              {/* Carte résumé état actuel */}
              <div style={{
                backgroundColor: 'var(--bg-input)',
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                  <span>Progression en direct</span>
                  <span style={{ color: Number(editCarnetDoneSeances) >= Number(editCarnetNbSeances) && Number(editCarnetNbSeances) > 0 ? '#10b981' : 'var(--accent-color)' }}>
                    {editCarnetDoneSeances || 0} / {editCarnetNbSeances || 0} séance{(Number(editCarnetNbSeances) || 0) > 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-card)', marginTop: '8px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Number(editCarnetNbSeances) > 0 ? Math.min(100, Math.round(((Number(editCarnetDoneSeances) || 0) / (Number(editCarnetNbSeances) || 1)) * 100)) : 0}%`,
                      height: '100%',
                      backgroundColor: Number(editCarnetDoneSeances) >= Number(editCarnetNbSeances) && Number(editCarnetNbSeances) > 0 ? '#10b981' : 'var(--accent-color)',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Restantes : <strong>{Math.max(0, (Number(editCarnetNbSeances) || 0) - (Number(editCarnetDoneSeances) || 0))}</strong></span>
                  <span>Prix payé figé : <strong>{Number(editCarnetModal.prixPaye || 0).toLocaleString('fr-FR')} FCFA</strong></span>
                </div>
              </div>

              {/* Ajustement N séances */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Nombre total de séances du carnet (N)
                  </label>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Saisie libre (0, 1, 2, 3...)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editCarnetNbSeances === '' ? 0 : Number(editCarnetNbSeances);
                      const next = Math.max(0, cur - 1);
                      setEditCarnetNbSeances(next);
                      if (Number(editCarnetDoneSeances) > next) {
                        setEditCarnetDoneSeances(next);
                      }
                    }}
                    className="btn btn-small"
                    style={{ padding: '8px 14px', fontWeight: 800, fontSize: '1rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                    title="Diminuer d'une séance"
                  >
                    –
                  </button>
                  <input
                    type="number"
                    min="0"
                    className="input-control"
                    style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.05rem', padding: '8px' }}
                    value={editCarnetNbSeances}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '') {
                        setEditCarnetNbSeances('');
                        return;
                      }
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) {
                        setEditCarnetNbSeances(n);
                      }
                    }}
                    placeholder="0"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editCarnetNbSeances === '' ? 0 : Number(editCarnetNbSeances);
                      setEditCarnetNbSeances(cur + 1);
                    }}
                    className="btn btn-small"
                    style={{ padding: '8px 14px', fontWeight: 800, fontSize: '1rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                    title="Ajouter une séance"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Ajustement Séances Déjà Consommées */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Séances effectuées / consommées
                  </label>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Ajustement manuel (0 à N)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editCarnetDoneSeances === '' ? 0 : Number(editCarnetDoneSeances);
                      setEditCarnetDoneSeances(Math.max(0, cur - 1));
                    }}
                    className="btn btn-small"
                    style={{ padding: '8px 14px', fontWeight: 800, fontSize: '1rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                    title="Diminuer"
                  >
                    –
                  </button>
                  <input
                    type="number"
                    min="0"
                    max={editCarnetNbSeances !== '' ? Number(editCarnetNbSeances) : undefined}
                    className="input-control"
                    style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.05rem', padding: '8px' }}
                    value={editCarnetDoneSeances}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '') {
                        setEditCarnetDoneSeances('');
                        return;
                      }
                      const n = parseInt(v, 10);
                      if (!isNaN(n) && n >= 0) {
                        setEditCarnetDoneSeances(n);
                      }
                    }}
                    placeholder="0"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editCarnetDoneSeances === '' ? 0 : Number(editCarnetDoneSeances);
                      const maxLimit = editCarnetNbSeances === '' ? 0 : Number(editCarnetNbSeances);
                      if (maxLimit === 0 || cur < maxLimit) {
                        setEditCarnetDoneSeances(cur + 1);
                      }
                    }}
                    className="btn btn-small"
                    style={{ padding: '8px 14px', fontWeight: 800, fontSize: '1rem', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                    title="Augmenter"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Fréquence & Date Fin */}
              <div className="form-grid-dates" style={{ marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Fréquence</label>
                  <select
                    className="input-control"
                    value={editCarnetFrequence}
                    onChange={e => setEditCarnetFrequence(e.target.value)}
                  >
                    <option value="hebdomadaire">Hebdomadaire</option>
                    <option value="bimensuelle">Bimensuelle</option>
                    <option value="mensuelle">Mensuelle</option>
                    <option value="personnalisee">Personnalisée</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Date d'expiration</label>
                  <input
                    type="date"
                    className="input-control"
                    value={editCarnetDateFin}
                    onChange={e => setEditCarnetDateFin(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Statut du forfait */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Statut du carnet</label>
                <select
                  className="input-control"
                  value={editCarnetStatut}
                  onChange={e => setEditCarnetStatut(e.target.value)}
                >
                  <option value="actif">Actif (en cours d'utilisation)</option>
                  <option value="termine">Terminé (consommé)</option>
                  <option value="suspendu">Suspendu (en pause)</option>
                  <option value="annule">Annulé</option>
                </select>
              </div>

              {/* Motif / Commentaire */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Motif de l'ajustement (traçabilité)</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: Ajout de séances de rattrapage, rectification manuelle..."
                  value={editCarnetMotif}
                  onChange={e => setEditCarnetMotif(e.target.value)}
                />
              </div>

              {/* Boutons actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setEditCarnetModal(null)}
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  disabled={isSavingCarnet}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingCarnet}
                  className="btn btn-primary"
                >
                  {isSavingCarnet ? "Enregistrement..." : "Appliquer le paramétrage"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL DE SUCCÈS TEMPORAIRE */}
      {successMessage && (
        <SuccessModal
          message={successMessage}
          onClose={() => setSuccessMessage('')}
        />
      )}
    </div>
  );
};

export default Abonnements;
