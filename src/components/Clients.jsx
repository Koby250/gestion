import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Users, Plus, Search, Edit2, Trash2, X, CheckCircle,
  Phone, Calendar, TrendingUp, Star, Award, ChevronDown, ChevronUp, User,
  MessageCircle, Cake, Clock, Send, Upload, Copy, Tag, StickyNote
} from 'lucide-react';
import { logEvent } from '../utils/audit';

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const getMonthFromDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) return parseInt(parts[1], 10);
  if (parts.length === 2) return parseInt(parts[0], 10);
  return null;
};

const Clients = ({ onNavigateToReservation }) => {
  const [clients, setClients]           = useState([]);
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [sortBy, setSortBy]             = useState('nom');
  const [selectedClient, setSelectedClient] = useState(null);
  const [localClientData, setLocalClientData] = useState({ tags: [], birthDate: '', notes: '' });
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [letterFilter, setLetterFilter] = useState('');

  // Form state
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [form, setForm]             = useState({ nom: '', prenom: '', telephone: '', notes: '', birthDate: '' });
  const [isSaving, setIsSaving]     = useState(false);

  // Pagination
  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // Call tracking form state
  const [callNote, setCallNote]     = useState('');
  const [savingCall, setSavingCall] = useState(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState(null);

  const handleCopyPhone = (phone, id) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  const handleUpdateQuickNote = async (clientId, notes) => {
    try {
      await updateDoc(doc(db, 'clients', clientId), { notes });
    } catch (err) {
      console.error("Erreur quick note:", err);
    }
  };

  const openClient = (c) => {
    setSelectedClient(c.id);
    setLocalClientData({
      tags: c.tags || [],
      birthDate: c.birthDate || '',
      notes: c.notes || ''
    });
    setSaveSuccess(false);
  };

  const saveLocalClientData = async (clientId) => {
    setIsSavingLocal(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, 'clients', clientId), {
        tags: localClientData.tags,
        birthDate: localClientData.birthDate,
        notes: localClientData.notes
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch(err) {
      console.error("Erreur saveLocalClientData:", err);
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setIsSavingLocal(false);
    }
  };

  const handleUpdateBirthdate = async (clientId, birthDate) => {
    try {
      await updateDoc(doc(db, 'clients', clientId), { birthDate });
    } catch (err) {
      console.error("Erreur birthDate:", err);
    }
  };

  const AVAILABLE_TAGS = [
    'À rappeler', 'Ne décroche pas', 'Numéro invalide', 
    'Numéro indisponible', 'Injoignable', 'Client régulier', 'VIP'
  ];

  const handleToggleTag = async (clientId, tag, currentTags = []) => {
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    try {
      await updateDoc(doc(db, 'clients', clientId), { tags: newTags });
    } catch (err) {
      console.error("Erreur toggle tag:", err);
    }
  };

  // ── Chargement des données ────────────────────────────────────────────────
  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, 'clients'), orderBy('nom', 'asc')),
      snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRes = onSnapshot(
      query(collection(db, 'reservations'), orderBy('datePrevue', 'desc')),
      snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), orderBy('date', 'desc')),
      snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubClients(); unsubRes(); unsubTx(); };
  }, []);

  // ── Enrichissement client avec données historiques ────────────────────────
  const enrichedClients = useMemo(() => {
    const currentMonth = new Date().getMonth() + 1;
    const now = new Date();

    return clients.map(client => {
      // Legacy support: match by just 'nom' or combination
      const nomComplet = [client.prenom, client.nom].filter(Boolean).join(' ').toLowerCase().trim();
      const legacyNom = (client.nom || '').toLowerCase().trim();

      // Réservations liées
      const clientRes = reservations.filter(r => {
        const rNom = (r.clientNom || '').toLowerCase().trim();
        return rNom === nomComplet || rNom === legacyNom || (legacyNom && rNom.includes(legacyNom));
      });
      const encaissees = clientRes.filter(r =>
        r.statut === 'encaisse' || r.statut === 'paye_totalement'
      );

      // Transactions liées (prestations)
      const clientTx = transactions.filter(t => {
        if (t.type !== 'prestation') return false;
        const tNom = (t.clientNom || '').toLowerCase().trim();
        return tNom === nomComplet || tNom === legacyNom || (legacyNom && tNom.includes(legacyNom));
      });

      const totalCA = client.chiffreAffaires !== undefined 
        ? client.chiffreAffaires 
        : clientTx.reduce((s, t) => s + Number(t.montant || 0), 0);

      const nbVisites = client.visites !== undefined 
        ? client.visites 
        : Math.max(encaissees.length, clientTx.length);

      const panierMoyen = nbVisites > 0 ? Math.round(totalCA / nbVisites) : 0;
      
      const derniereVisite = client.lastVisit 
        ? client.lastVisit.split('T')[0] 
        : (clientRes.length > 0
            ? clientRes.sort((a, b) => b.datePrevue.localeCompare(a.datePrevue))[0].datePrevue
            : null);

      // Service favori
      const servicesCount = {};
      clientRes.forEach(r => {
        if (r.serviceNom) {
          servicesCount[r.serviceNom] = (servicesCount[r.serviceNom] || 0) + 1;
        }
      });
      let serviceFavori = '-';
      let maxCount = 0;
      for (const [srv, count] of Object.entries(servicesCount)) {
        if (count > maxCount) {
          maxCount = count;
          serviceFavori = srv;
        }
      }

      // Calcul du mois d'anniversaire
      const birthMonth = getMonthFromDate(client.birthDate);
      const isBirthdayMonth = birthMonth === currentMonth;

      // Calcul du statut Dynamique
      let fidelite = 'Nouveau';
      let fideliteColor = 'var(--text-muted)';
      
      let daysSinceLastVisit = 0;
      if (derniereVisite) {
        const lastDate = new Date(derniereVisite);
        daysSinceLastVisit = Math.floor((now - lastDate) / (1000 * 3600 * 24));
      }

      if (daysSinceLastVisit > 30 && nbVisites > 0) {
        fidelite = 'À relancer';
        fideliteColor = '#ef4444'; // red
      } else if (nbVisites >= 15 || totalCA > 200000) {
        fidelite = 'VIP';
        fideliteColor = '#f59e0b'; // amber
      } else if (nbVisites >= 8) {
        fidelite = 'Fidèle';
        fideliteColor = '#8b5cf6'; // purple
      } else if (nbVisites >= 3) {
        fidelite = 'Régulier';
        fideliteColor = 'var(--accent-color)'; // blue
      }

      return { 
        ...client, 
        totalCA, 
        nbVisites, 
        panierMoyen, 
        derniereVisite, 
        fidelite, 
        fideliteColor, 
        isBirthdayMonth,
        serviceFavori
      };
    });
  }, [clients, reservations, transactions]);

  // ── Compteurs par lettre (sur l'ensemble des clients enrichis, avant tout filtre) ──
  const letterCounts = useMemo(() => {
    const counts = {};
    enrichedClients.forEach(c => {
      // La lettre pivot est la 1ère lettre du nom, sinon du prénom
      const pivot = (c.nom || c.prenom || '').trim();
      if (!pivot) return;
      const letter = pivot[0].toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // retire les accents (É → E)
      counts[letter] = (counts[letter] || 0) + 1;
    });
    return counts;
  }, [enrichedClients]);

  // Lettres présentes, triées
  const activeLetters = useMemo(() => Object.keys(letterCounts).sort(), [letterCounts]);

  // ── Filtre & tri ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...enrichedClients];
    if (statusFilter !== 'Tous') {
      list = list.filter(c => c.fidelite === statusFilter);
    }
    if (letterFilter) {
      list = list.filter(c => {
        const pivot = (c.nom || c.prenom || '').trim();
        if (!pivot) return false;
        const l = pivot[0].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return l === letterFilter;
      });
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.nom || '').toLowerCase().includes(s) ||
        (c.prenom || '').toLowerCase().includes(s) ||
        (c.telephone || '').includes(s)
      );
    }
    // Toujours trier par nom A→Z en priorité, sauf si un autre tri est sélectionné
    if (sortBy === 'nom') list.sort((a, b) => (a.nom || a.prenom || '').localeCompare(b.nom || b.prenom || '', 'fr'));
    if (sortBy === 'visites') list.sort((a, b) => b.nbVisites - a.nbVisites);
    if (sortBy === 'ca') list.sort((a, b) => b.totalCA - a.totalCA);
    if (sortBy === 'derniereVisite') list.sort((a, b) => (b.derniereVisite || '').localeCompare(a.derniereVisite || ''));
    if (sortBy === 'relancer') list.sort((a, b) => (a.fidelite === 'À relancer' ? -1 : 1));
    return list;
  }, [enrichedClients, searchTerm, sortBy, statusFilter, letterFilter]);

  // Réinitialise la page à 1 dès que les filtres changent
  useEffect(() => { setCurrentPage(1); }, [searchTerm, sortBy, statusFilter, letterFilter]);

  // Clients de la page courante
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  // ── KPIs globaux ─────────────────────────────────────────────────────────
  const totalCA      = enrichedClients.reduce((s, c) => s + c.totalCA, 0);
  const totalVisites = enrichedClients.reduce((s, c) => s + c.nbVisites, 0);
  const panierGlobal = totalVisites > 0 ? Math.round(totalCA / totalVisites) : 0;
  const nbVIP        = enrichedClients.filter(c => c.fidelite === 'VIP').length;

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const resetForm = () => { setForm({ nom: '', prenom: '', telephone: '', notes: '', birthDate: '' }); setEditingId(null); };

  const handleOpenAdd = () => { resetForm(); setShowForm(true); };

  const handleEdit = (c) => {
    setForm({ 
      nom: c.nom || '', 
      prenom: c.prenom || '',
      telephone: c.telephone || '', 
      notes: c.notes || '',
      birthDate: c.birthDate || ''
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim() && !form.prenom.trim()) {
      alert("Veuillez renseigner au moins un prénom ou un nom.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        telephone: form.telephone.trim(),
        notes: form.notes.trim(),
        birthDate: form.birthDate || null
      };

      if (editingId) {
        await updateDoc(doc(db, 'clients', editingId), payload);
        await logEvent('CLIENT_UPDATE', `Modification client : ${form.prenom} ${form.nom}`);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...payload,
          suiviAppels: [],
          createdAt: new Date().toISOString()
        });
        await logEvent('CLIENT_CREATE', `Ajout client : ${form.prenom} ${form.nom}`);
      }
      resetForm(); setShowForm(false);
    } catch (err) {
      console.error('[Clients] Erreur:', err);
      alert('Une erreur est survenue.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: 0 });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;

        // ── 1. Nettoyage du BOM UTF-8 et des caractères invisibles ───────────
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) {
          alert("Le fichier est vide ou ne contient que l'en-tête.");
          setIsImporting(false);
          return;
        }

        // ── 2. Détection automatique du séparateur (, ou ;) ──────────────────
        const headerLine = lines[0];
        const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';

        // ── 3. Normalisation élargie des en-têtes (FR + EN, accents, espaces) ─
        const normalize = (str) =>
          str.normalize('NFD')
             .replace(/[\u0300-\u036f]/g, '')
             .toLowerCase()
             .replace(/[\s_\-]+/g, '');

        const headers = headerLine.split(delimiter).map(h =>
          normalize(h.replace(/^"|"$/g, '').trim())
        );

        // Mapping élargi : prénom
        const PRENOM_KEYS  = new Set(['prenom', 'firstname', 'givenname', 'name', 'displayname', 'fullname', 'contactname']);
        // Mapping élargi : nom
        const NOM_KEYS     = new Set(['nom', 'lastname', 'surname', 'familyname']);
        // Mapping élargi : téléphone (plusieurs colonnes possibles, priorité Mobile > Home > Business)
        const TEL_PRIORITY = ['mobilephone', 'mobile', 'cellphone', 'cell', 'tel', 'telephone', 'phone',
                              'homephone', 'businessphone', 'workphone', 'contact', 'numero', 'phonenumber'];

        const prenomIdx = headers.findIndex(h => PRENOM_KEYS.has(h));
        const nomIdx    = headers.findIndex(h => NOM_KEYS.has(h));

        // Cherche la 1ère colonne téléphone selon l'ordre de priorité
        let telIdx = -1;
        for (const key of TEL_PRIORITY) {
          const idx = headers.findIndex(h => h.includes(key));
          if (idx !== -1) { telIdx = idx; break; }
        }
        // Fallback générique si aucune correspondance exacte
        if (telIdx === -1) telIdx = headers.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('mobile') || h.includes('numero') || h.includes('contact'));

        const dateIdx = headers.findIndex(h =>
          h.includes('birthday') || h.includes('birthdate') || h.includes('anniversaire') || (h.includes('date') && h.includes('birth'))
        );

        // ── 4. Construction des payloads valides ────────────────────────────
        const payloads = [];
        let ignoredCount = 0;

        for (let i = 1; i < lines.length; i++) {
          // Gestion des champs entre guillemets contenant des virgules
          const cols = lines[i].match(/(?:"([^"]*(?:""[^"]*)*)"|\'([^\']*)\'|([^,;]+)|(?<=,|;)(?=,|;)|^(?=,)|(?<=,)$)/g)
            ? lines[i].split(delimiter)
            : lines[i].split(delimiter);
          const parsedCols = cols.map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

          const p = (prenomIdx >= 0 && parsedCols[prenomIdx]) ? parsedCols[prenomIdx].trim() : '';
          const n = (nomIdx    >= 0 && parsedCols[nomIdx])    ? parsedCols[nomIdx].trim()    : '';
          let   t = (telIdx    >= 0 && parsedCols[telIdx])    ? parsedCols[telIdx].trim()    : '';
          const d = (dateIdx   >= 0 && parsedCols[dateIdx])   ? parsedCols[dateIdx].trim()   : '';

          // Nettoyage du numéro de téléphone (espaces, tirets, points)
          t = t.replace(/[\s\.\-]/g, '');

          // Ignorer uniquement si aucun numéro de téléphone valide
          if (!t) { ignoredCount++; continue; }
          // Un nom ou prénom est requis (peut être extrait de displayname)
          if (!p && !n) { ignoredCount++; continue; }

          // Parsing de date anniversaire (formats JJ/MM, MM/JJ, JJ-MM, MM-JJ)
          let finalDate = null;
          if (d) {
            const dateParts = d.split(/[\/ \-]/);
            if (dateParts.length >= 2) {
              const part0 = dateParts[0].padStart(2, '0');
              const part1 = dateParts[1].padStart(2, '0');
              if (!isNaN(part0) && !isNaN(part1)) {
                // Heuristique : si part0 > 12, c'est un jour (format JJ/MM)
                const [month, day] = parseInt(part0) > 12
                  ? [part1, part0]
                  : [part0, part1];
                finalDate = `${month}-${day}`;
              }
            }
          }

          payloads.push({
            prenom: p,
            nom: n,
            telephone: t,
            birthDate: finalDate,
            notes: 'Importé via CSV',
            suiviAppels: [],
            visites: 0,
            visits: 0,
            chiffreAffaires: 0,
            totalSpent: 0,
            createdAt: serverTimestamp()
          });
        }

        // ── 5. Découpage en lots de 400 et commit séquentiel ─────────────────
        const BATCH_SIZE = 400;
        const totalBatches = Math.ceil(payloads.length / BATCH_SIZE);
        setImportProgress({ current: 0, total: totalBatches });

        let importedCount = 0;
        let batchErrors   = 0;

        for (let b = 0; b < totalBatches; b++) {
          const chunk = payloads.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(payload => {
            const ref = doc(collection(db, 'clients'));
            batch.set(ref, payload);
          });
          try {
            await batch.commit();
            importedCount += chunk.length;
          } catch (batchErr) {
            console.error(`[Import CSV] Erreur lot ${b + 1}/${totalBatches}:`, batchErr);
            batchErrors += chunk.length;
          }
          setImportProgress({ current: b + 1, total: totalBatches });
        }

        // ── 6. Résumé détaillé ────────────────────────────────────────────────
        const parts = [`✅ ${importedCount} contact${importedCount > 1 ? 's' : ''} importé${importedCount > 1 ? 's' : ''} avec succès.`];
        if (ignoredCount > 0) parts.push(`⏭️ ${ignoredCount} ligne${ignoredCount > 1 ? 's' : ''} ignorée${ignoredCount > 1 ? 's' : ''} (sans numéro de téléphone valide).`);
        if (batchErrors  > 0) parts.push(`⚠️ ${batchErrors} contact${batchErrors > 1 ? 's' : ''} non importé${batchErrors > 1 ? 's' : ''} (erreur Firestore).`);
        alert(parts.join('\n'));
        setShowCsvModal(false);

      } catch (err) {
        console.error('[Import CSV] Erreur globale:', err);
        alert("Une erreur est survenue lors de l'importation du fichier.");
      } finally {
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0 });
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Supprimer le client "${c.prenom} ${c.nom}" ? L'historique de ses réservations est conservé.`)) return;
    try {
      await deleteDoc(doc(db, 'clients', c.id));
      await logEvent('CLIENT_DELETE', `Suppression client : ${c.nom}`);
    } catch (err) { console.error(err); }
  };

  // ── Détection numéro nigérien (+227) ──────────────────────────────────────
  const isNigerPhone = (phone) => {
    if (!phone) return false;
    const cleaned = phone.replace(/[\s\.\-\(\)]/g, '');
    // Format international : +227XXXXXXXX ou 00227XXXXXXXX
    if (cleaned.startsWith('+227')) return true;
    if (cleaned.startsWith('00227')) return true;
    // Format local Niger : 8 chiffres commençant par 7, 8, 9 (mobile) ou 2 (fixe Niamey etc.)
    if (/^[2789]\d{7}$/.test(cleaned)) return true;
    return false;
  };

  // ── Purge des numéros non-nigériens ───────────────────────────────────────
  const [isPurging, setIsPurging] = useState(false);

  const handlePurgeNonNiger = async () => {
    const nonNigerClients = clients.filter(c => !isNigerPhone(c.telephone));
    if (nonNigerClients.length === 0) {
      alert('✅ Tous les numéros sont déjà nigériens (+227). Aucune suppression nécessaire.');
      return;
    }

    const confirmed1 = window.confirm(
      `⚠️ ATTENTION — Opération irréversible !\n\n` +
      `${nonNigerClients.length} client(s) ont un numéro non-nigérien (hors +227) et vont être SUPPRIMÉS de la base.\n\n` +
      `Voulez-vous continuer ?`
    );
    if (!confirmed1) return;

    const confirmed2 = window.confirm(
      `🔴 DERNIÈRE CONFIRMATION\n\n` +
      `Vous allez supprimer définitivement ${nonNigerClients.length} client(s) non-nigériens.\n` +
      `Cette action est IRRÉVERSIBLE.\n\nCliquez OK pour confirmer.`
    );
    if (!confirmed2) return;

    setIsPurging(true);
    try {
      const BATCH_SIZE = 400;
      let deleted = 0;
      for (let i = 0; i < nonNigerClients.length; i += BATCH_SIZE) {
        const chunk = nonNigerClients.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(c => batch.delete(doc(db, 'clients', c.id)));
        await batch.commit();
        deleted += chunk.length;
      }
      await logEvent('CLIENT_PURGE', `Purge numéros non-nigériens : ${deleted} client(s) supprimés`);
      alert(`✅ Purge terminée !\n${deleted} client(s) non-nigériens supprimés.\nSeuls les numéros +227 (Niger) sont conservés.`);
    } catch (err) {
      console.error('[Purge] Erreur:', err);
      alert('❌ Erreur lors de la purge. Vérifiez la console.');
    } finally {
      setIsPurging(false);
    }
  };

  // Suivi d'appels
  const handleAddCallNote = async (clientId, e) => {
    e.preventDefault();
    if (!callNote.trim()) return;
    setSavingCall(clientId);
    try {
      const client = clients.find(c => c.id === clientId);
      const newNote = {
        date: new Date().toISOString(),
        note: callNote.trim()
      };
      const currentSuivi = client.suiviAppels || [];
      await updateDoc(doc(db, 'clients', clientId), {
        suiviAppels: [newNote, ...currentSuivi]
      });
      setCallNote('');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'ajout de la note d'appel.");
    } finally {
      setSavingCall(null);
    }
  };

  const cleanPhoneForWhatsApp = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
    return cleaned;
  };

  return (
    <div className="view-container">
      {/* ── KPI STRIP ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Clients enregistrés', value: clients.length, icon: <Users size={20} />, color: 'var(--accent-color)' },
          { label: 'Visites totales', value: totalVisites, icon: <Calendar size={20} />, color: 'var(--success)' },
          { label: 'Panier moyen global', value: `${panierGlobal.toLocaleString('fr-FR')} F`, icon: <TrendingUp size={20} />, color: '#8b5cf6' },
          { label: 'Clients VIP', value: nbVIP, icon: <Star size={20} />, color: '#f59e0b' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px',
            border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: kpi.color }}>
              {kpi.icon}
              <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="var(--accent-color)" />
            <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Base de Données Clients</h2>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={handlePurgeNonNiger}
              disabled={isPurging}
              title="Supprimer tous les clients dont le numéro n'est pas nigérien (+227)"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: isPurging ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.12)',
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.4)',
                fontWeight: '700',
                opacity: isPurging ? 0.7 : 1,
                cursor: isPurging ? 'not-allowed' : 'pointer'
              }}
            >
              {isPurging ? '⏳ Purge en cours…' : '🇳🇪 Garder Niger uniquement'}
            </button>
            <button className="btn" onClick={() => setShowCsvModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
              <Upload size={18} /> Importer (CSV)
            </button>
            <button className="btn btn-primary" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={18} /> Nouveau client
            </button>
          </div>
        </div>

        {/* ── FILTRES RAPIDES ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['Tous', 'À relancer', 'VIP', 'Fidèle', 'Régulier', 'Nouveau'].map(f => (
            <button key={f} 
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                border: statusFilter === f ? 'none' : '1px solid var(--border-color)',
                backgroundColor: statusFilter === f ? (f === 'À relancer' ? '#ef4444' : f === 'VIP' ? '#f59e0b' : f === 'Fidèle' ? '#8b5cf6' : f === 'Régulier' ? 'var(--accent-color)' : 'var(--text-main)') : 'transparent',
                color: statusFilter === f ? '#fff' : 'var(--text-main)',
                transition: 'all 0.2s ease'
              }}
            >
              {f === 'À relancer' ? 'À relancer > 30j' : f}
            </button>
          ))}
        </div>

        {/* ── INDEX ALPHABÉTIQUE A-Z ───────────────────────────────────────── */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px',
            backgroundColor: 'var(--bg-input)', borderRadius: '12px',
            padding: '10px 12px', border: '1px solid var(--border-color)'
          }}>
            {/* Bouton « Tous » */}
            <button
              onClick={() => setLetterFilter('')}
              style={{
                minWidth: '36px', height: '32px', padding: '0 8px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '700', fontSize: '0.78rem',
                backgroundColor: letterFilter === '' ? 'var(--accent-color)' : 'transparent',
                color: letterFilter === '' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
              title="Afficher tous les clients"
            >
              ★ Tous
            </button>

            {/* Séparateur */}
            <div style={{ width: '1px', backgroundColor: 'var(--border-color)', margin: '2px 4px', flexShrink: 0 }} />

            {/* Lettres A-Z */}
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
              const count = letterCounts[letter] || 0;
              const isActive = letterFilter === letter;
              const hasClients = count > 0;
              return (
                <button
                  key={letter}
                  onClick={() => hasClients && setLetterFilter(isActive ? '' : letter)}
                  title={hasClients ? `${count} client${count > 1 ? 's' : ''} — ${letter}` : `Aucun client commençant par ${letter}`}
                  style={{
                    position: 'relative',
                    minWidth: '32px', height: '32px', padding: '0 4px',
                    borderRadius: '7px', border: 'none',
                    cursor: hasClients ? 'pointer' : 'default',
                    fontWeight: '700', fontSize: '0.8rem',
                    backgroundColor: isActive ? 'var(--accent-color)' : (hasClients ? 'var(--bg-card)' : 'transparent'),
                    color: isActive ? '#fff' : (hasClients ? 'var(--text-main)' : 'var(--text-muted)'),
                    opacity: hasClients ? 1 : 0.3,
                    transition: 'all 0.15s ease',
                    border: isActive ? 'none' : (hasClients ? '1px solid var(--border-color)' : 'none'),
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                  }}
                >
                  <span>{letter}</span>
                  {hasClients && (
                    <span style={{
                      fontSize: '0.52rem', fontWeight: '800', lineHeight: 1,
                      color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
                      marginTop: '1px'
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── FILTRES RECHERCHE ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '220px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" className="input-control"
              style={{ paddingLeft: '38px', width: '100%', margin: 0 }}
              placeholder="Rechercher par nom, prénom ou téléphone…"
              value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setLetterFilter(''); }}
            />
          </div>
          <select className="input-control" style={{ flex: 1, minWidth: '170px', margin: 0 }}
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="nom">Trier : Nom (A→Z)</option>
            <option value="visites">Trier : Visites (↓)</option>
            <option value="ca">Trier : CA généré (↓)</option>
            <option value="derniereVisite">Trier : Dernière visite (↓)</option>
            <option value="relancer">Trier : À relancer en 1er</option>
          </select>
        </div>

        {/* ── LISTE ───────────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <User size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontWeight: '600' }}>Aucun client trouvé.</p>
            <p style={{ fontSize: '0.85rem' }}>Ajoutez votre premier client ou vérifiez votre recherche.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Compteur de résultats */}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{filtered.length} client{filtered.length > 1 ? 's' : ''} — page {currentPage}/{totalPages}</span>
              <span style={{ fontSize: '0.75rem' }}>Affichage de {Math.min(ITEMS_PER_PAGE, filtered.length - (currentPage - 1) * ITEMS_PER_PAGE)} sur {filtered.length}</span>
            </div>
            {paginatedClients.map(client => (
              <div key={client.id} style={{
                backgroundColor: 'var(--bg-input)', borderRadius: '14px',
                border: client.fidelite === 'À relancer' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)', 
                overflow: 'hidden',
                transition: 'box-shadow 0.2s ease'
              }}>
                {/* Row principale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${client.fideliteColor}33, ${client.fideliteColor}66)`,
                    border: `2px solid ${client.fideliteColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '800', fontSize: '1.1rem', color: client.fideliteColor,
                    position: 'relative'
                  }}>
                    {(client.prenom ? client.prenom[0] : (client.nom || '?')[0]).toUpperCase()}
                    {client.isBirthdayMonth && (
                      <div style={{ position: 'absolute', top: '-5px', right: '-8px', fontSize: '0.7rem', fontWeight: '700', backgroundColor: 'var(--accent-color)', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))' }} title="C'est son mois d'anniversaire !"><Cake size={11} /></div>
                    )}
                  </div>

                  {/* Infos */}
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)' }}>
                        {[client.prenom, client.nom].filter(Boolean).join(' ')}
                      </span>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                        border: `1px solid ${client.fideliteColor}55`,
                        color: client.fideliteColor, backgroundColor: `${client.fideliteColor}11`
                      }}>
                        {client.fidelite === 'VIP' && <Award size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />}
                        {client.fidelite === 'À relancer' && <Clock size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />}
                        {client.fidelite}
                      </span>
                    </div>
                    {client.telephone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Phone size={12} /> {client.telephone}
                          <button 
                            onClick={() => handleCopyPhone(client.telephone, client.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: copiedPhoneId === client.id ? 'var(--success)' : 'var(--text-muted)' }}
                            title="Copier le numéro"
                          >
                            {copiedPhoneId === client.id ? <CheckCircle size={14} /> : <Copy size={14} />}
                          </button>
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <a href={`tel:${client.telephone}`} style={{ color: 'var(--accent-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
                            <Phone size={12} /> Appel
                          </a>
                          <a href={`https://wa.me/${cleanPhoneForWhatsApp(client.telephone)}?text=${encodeURIComponent(`Bonjour ${client.prenom || client.nom || ''},\n\nNous espérons que vous allez bien ! Ça fait un moment que nous n'avons pas eu le plaisir de vous voir au salon. N'hésitez pas à réserver votre prochain créneau. À très vite !`)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                        </div>
                      </div>
                    )}
                    {client.derniereVisite && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Dernière visite : <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>{client.derniereVisite}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: '20px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-color)' }}>{client.nbVisites}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600' }}>Visites</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--success)' }}>{client.totalCA.toLocaleString('fr-FR')}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600' }}>FCFA généré</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#8b5cf6', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={client.serviceFavori}>
                        {client.serviceFavori}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600' }}>Préféré</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button className="btn btn-small btn-primary"
                      style={{ border: 'none', padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => openClient(client)}
                      title="Ouvrir la fiche client"
                    >
                      Ouvrir
                    </button>
                    <button className="btn btn-small"
                      style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                      onClick={() => handleEdit(client)} title="Modifier">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(client)} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* ── PAGINATION ───────────────────────────────────────────────── */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  ← Précédent
                </button>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === '...' ? (
                        <span key={`ellipsis-${idx}`} style={{ padding: '6px 4px', color: 'var(--text-muted)', lineHeight: '32px' }}>…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem',
                            backgroundColor: currentPage === p ? 'var(--accent-color)' : 'var(--bg-input)',
                            color: currentPage === p ? '#fff' : 'var(--text-main)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {p}
                        </button>
                      )
                    )
                  }
                </div>

                <button
                  className="btn"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', opacity: currentPage === totalPages ? 0.4 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL FORMULAIRE ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <Users size={20} color="var(--accent-color)" />
                {editingId ? 'Modifier le client' : 'Nouveau client'}
              </h2>
              <button className="btn-icon" onClick={() => { setShowForm(false); resetForm(); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                  <label>Prénom</label>
                  <input type="text" className="input-control" placeholder="Ex : Idriss"
                    value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                  <label>Nom</label>
                  <input type="text" className="input-control" placeholder="Ex : Farouk"
                    value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                  <label>Téléphone (WhatsApp)</label>
                  <input type="tel" className="input-control" placeholder="Ex : +225 07..."
                    value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                  <label>Anniversaire (Jour / Mois)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="input-control" style={{ flex: 1 }}
                      value={form.birthDate ? form.birthDate.split('-').pop() : ''} 
                      onChange={e => {
                        let currentMonth = '01';
                        if (form.birthDate) {
                           const parts = form.birthDate.split('-');
                           currentMonth = parts.length === 3 ? parts[1] : parts[0];
                        }
                        setForm({ ...form, birthDate: e.target.value ? `${currentMonth}-${e.target.value.padStart(2, '0')}` : '' });
                      }}>
                      <option value="">Jour</option>
                      {Array.from({ length: 31 }, (_, i) => <option key={i+1} value={String(i+1).padStart(2, '0')}>{i+1}</option>)}
                    </select>
                    <select className="input-control" style={{ flex: 2 }}
                      value={form.birthDate ? (form.birthDate.split('-').length === 3 ? form.birthDate.split('-')[1] : form.birthDate.split('-')[0]) : ''} 
                      onChange={e => {
                        let currentDay = '01';
                        if (form.birthDate) {
                           const parts = form.birthDate.split('-');
                           currentDay = parts[parts.length - 1];
                        }
                        setForm({ ...form, birthDate: e.target.value ? `${e.target.value.padStart(2, '0')}-${currentDay}` : '' });
                      }}>
                      <option value="">Mois</option>
                      {['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => (
                        <option key={i+1} value={String(i+1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Notes & Préférences internes</label>
                <textarea className="input-control" placeholder="Ex : Allergie au menthol, préférence rasoir droit…"
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', marginTop: '8px' }}>
                <CheckCircle size={18} /> {isSaving ? 'Enregistrement…' : (editingId ? 'Enregistrer les modifications' : 'Ajouter le client')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORT CSV */}
      {showCsvModal && (
        <div className="modal-overlay" onClick={() => setShowCsvModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Upload size={18} color="var(--accent-color)" /> Importer des clients (CSV)</h2>
              <button className="btn-icon" onClick={() => setShowCsvModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                Importez une liste de clients depuis un fichier CSV (Outlook, Google Contacts, etc.). Fichiers de plus de 4 000 contacts supportés.
              </p>

              <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '12px', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: '700', color: 'var(--text-main)' }}>En-têtes reconnus automatiquement :</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  <div><span style={{ color: 'var(--text-main)', fontWeight: '700' }}>Prénom :</span> First Name, Display Name, prenom, name</div>
                  <div><span style={{ color: 'var(--text-main)', fontWeight: '700' }}>Nom :</span> Last Name, nom, surname</div>
                  <div><span style={{ color: 'var(--text-main)', fontWeight: '700' }}>Tél. :</span> Mobile Phone, Home Phone, Business Phone, telephone, phone…</div>
                  <div><span style={{ color: 'var(--text-main)', fontWeight: '700' }}>Séparateur :</span> virgule (,) ou point-virgule (;) détecté auto.</div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  ⚠️ Seules les lignes <strong>sans numéro de téléphone</strong> sont ignorées. Les emojis et caractères spéciaux sont supportés.
                </p>
              </div>

              {/* Barre de progression d'import */}
              {isImporting && importProgress.total > 0 && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>Importation en cours…</span>
                    <span>Lot {importProgress.current}/{importProgress.total}</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '99px',
                      backgroundColor: 'var(--accent-color)',
                      width: `${importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%`,
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>
              )}

              <div>
                <input
                  type="file"
                  accept=".csv"
                  id="csv-upload"
                  style={{ display: 'none' }}
                  onChange={handleCsvUpload}
                  disabled={isImporting}
                />
                <label
                  htmlFor="csv-upload"
                  className="btn btn-primary"
                  style={{ display: 'flex', justifyContent: 'center', cursor: isImporting ? 'not-allowed' : 'pointer', padding: '14px', width: '100%', fontSize: '1rem', opacity: isImporting ? 0.7 : 1 }}
                >
                  {isImporting
                    ? (importProgress.total > 0
                        ? `⏳ Lot ${importProgress.current}/${importProgress.total} en cours…`
                        : '⏳ Analyse du fichier…')
                    : '📂 Sélectionner un fichier CSV'}
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FICHE CLIENT (Modale dédiée) ──────────────────────────── */}
      {selectedClient && (() => {
        // Retrouver la dernière version du client en temps réel
        const client = clients.find(c => c.id === selectedClient) || null;
        if (!client) return null; // Sécurité si supprimé pendant l'ouverture

        const nomComplet = [client.prenom, client.nom].filter(Boolean).join(' ').toLowerCase().trim();
        const legacyNom = (client.nom || '').toLowerCase().trim();
        const clientRes = reservations.filter(r => {
          const rNom = (r.clientNom || '').toLowerCase().trim();
          return rNom === nomComplet || rNom === legacyNom || (legacyNom && rNom.includes(legacyNom));
        }).slice(0, 10);
        
        const appels = client.suiviAppels || [];

        return (
          <div className="modal-overlay" onClick={() => setSelectedClient(null)}>
            <div className="modal-content" style={{ maxWidth: '850px', width: '95%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '85vh' }} onClick={e => e.stopPropagation()}>
              
              <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-input)', border: '2px solid var(--accent-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '800', fontSize: '1.2rem', color: 'var(--accent-color)'
                  }}>
                    {(client.prenom ? client.prenom[0] : (client.nom || '?')[0]).toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, padding: 0, border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {[client.prenom, client.nom].filter(Boolean).join(' ')}
                    </h2>
                    {client.telephone && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <Phone size={14} /> {client.telephone}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={() => {
                      if (onNavigateToReservation) {
                        setSelectedClient(null);
                        onNavigateToReservation(client);
                      }
                    }}
                  >
                    <Calendar size={16} /> Planifier un RDV
                  </button>
                  <button className="btn-icon" onClick={() => setSelectedClient(null)}><X size={24} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', overflowY: 'auto', flex: 1, backgroundColor: 'var(--bg-primary)' }}>
                
                {/* Colonne GAUCHE : Tags, Infos, Notes */}
                <div style={{ flex: '1 1 300px', padding: '24px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* TAGS */}
                  <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Tag size={16} /> Tags & Statuts
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {AVAILABLE_TAGS.map(tag => {
                        const isActive = localClientData.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => setLocalClientData(prev => ({ ...prev, tags: isActive ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] }))}
                            style={{
                              padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                              border: `1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}`,
                              backgroundColor: isActive ? 'var(--accent-color)' : 'var(--bg-card)',
                              color: isActive ? '#fff' : 'var(--text-main)',
                              cursor: 'pointer', transition: 'all 0.2s ease'
                            }}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ANNIVERSAIRE */}
                  <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cake size={16} /> Date d'anniversaire
                    </h4>
                    <input 
                      type="text" 
                      className="input-control" 
                      placeholder="Ex: 25-12 ou 25/12"
                      value={localClientData.birthDate}
                      onChange={(e) => setLocalClientData(prev => ({ ...prev, birthDate: e.target.value }))}
                      style={{ margin: 0, width: '100%', maxWidth: '200px' }}
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Format attendu : JJ-MM ou JJ/MM</div>
                  </div>

                  {/* NOTES */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#f59e0b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <StickyNote size={16} /> Notes & Préférences internes
                    </h4>
                    <textarea 
                      className="input-control"
                      style={{ margin: 0, width: '100%', resize: 'vertical', minHeight: '120px', flex: 1, backgroundColor: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}
                      placeholder="Ex: Coiffeur favori, allergies, style de coupe..."
                      value={localClientData.notes}
                      onChange={(e) => setLocalClientData(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>

                  {/* BOUTON ENREGISTRER */}
                  <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                    <button 
                      onClick={() => saveLocalClientData(client.id)}
                      disabled={isSavingLocal}
                      style={{
                        width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                        backgroundColor: saveSuccess ? '#10b981' : 'var(--accent-color)',
                        color: '#fff', fontWeight: 'bold', fontSize: '0.95rem',
                        cursor: 'pointer', transition: 'background-color 0.3s ease',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                      }}
                    >
                      {saveSuccess ? (
                        <><CheckCircle size={18} /> Validé !</>
                      ) : isSavingLocal ? (
                        'Enregistrement...'
                      ) : (
                        'Enregistrer les modifications'
                      )}
                    </button>
                  </div>

                </div>

                {/* Colonne DROITE : Historique Appels & Réservations */}
                <div style={{ flex: '1.5 1 400px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* SUIVI D'APPELS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Phone size={16} /> Campagne & Suivi d'Appels
                    </h4>
                    
                    <form onSubmit={(e) => handleAddCallNote(client.id, e)} style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="input-control" 
                        placeholder="Note de l'appel (ex: Occupé, Rdv pris pour samedi...)"
                        value={callNote}
                        onChange={e => setCallNote(e.target.value)}
                        style={{ margin: 0, flex: 1, fontSize: '0.9rem' }}
                      />
                      <button type="submit" className="btn btn-primary" style={{ padding: '0 16px' }} disabled={savingCall === client.id}>
                        <Send size={18} />
                      </button>
                    </form>

                    {appels.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }}>
                        {appels.map((appel, idx) => (
                          <div key={idx} style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', borderLeft: '4px solid var(--accent-color)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: '600' }}>
                              {new Date(appel.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{appel.note}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px' }}>Aucun suivi d'appel enregistré pour ce client.</div>
                    )}
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                  {/* DERNIERS PASSAGES */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={16} /> Derniers passages (Réservations)
                    </h4>
                    
                    {clientRes.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', fontStyle: 'italic' }}>Aucun historique de réservation trouvé.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '8px' }}>
                        {clientRes.map(r => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div>
                              <div style={{ color: 'var(--text-main)', fontWeight: '700' }}>{r.serviceNom || 'Prestation'}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{new Date(r.datePrevue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span style={{ fontWeight: '800', color: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'var(--success)' : 'var(--text-muted)' }}>
                                {r.prixTotal?.toLocaleString('fr-FR')} F
                              </span>
                              <span style={{
                                fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', textTransform: 'uppercase',
                                backgroundColor: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                                color: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'var(--success)' : 'var(--danger)'
                              }}>
                                {r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'Payé' : r.statut?.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default Clients;
