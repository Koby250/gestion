import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Users, Plus, Search, Edit2, Trash2, X, CheckCircle,
  Phone, Calendar, TrendingUp, Star, Award, ChevronDown, ChevronUp, User,
  MessageCircle, Cake, Clock, Send, Upload, Copy
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

const Clients = () => {
  const [clients, setClients]           = useState([]);
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [sortBy, setSortBy]             = useState('nom');
  const [expandedId, setExpandedId]     = useState(null);
  const [statusFilter, setStatusFilter] = useState('Tous');

  // Form state
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [form, setForm]             = useState({ nom: '', prenom: '', telephone: '', notes: '', birthDate: '' });
  const [isSaving, setIsSaving]     = useState(false);

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

  // ── Filtre & tri ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...enrichedClients];
    if (statusFilter !== 'Tous') {
      list = list.filter(c => c.fidelite === statusFilter);
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.nom || '').toLowerCase().includes(s) ||
        (c.prenom || '').toLowerCase().includes(s) ||
        (c.telephone || '').includes(s)
      );
    }
    if (sortBy === 'nom') list.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    if (sortBy === 'visites') list.sort((a, b) => b.nbVisites - a.nbVisites);
    if (sortBy === 'ca') list.sort((a, b) => b.totalCA - a.totalCA);
    if (sortBy === 'derniereVisite') list.sort((a, b) => (b.derniereVisite || '').localeCompare(a.derniereVisite || ''));
    if (sortBy === 'relancer') list.sort((a, b) => (a.fidelite === 'À relancer' ? -1 : 1));
    return list;
  }, [enrichedClients, searchTerm, sortBy]);

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
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target.result;
        
        // 1. Nettoyage du BOM UTF-8 éventuel
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.slice(1);
        }
        
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) {
          alert("Le fichier est vide ou ne contient que l'en-tête.");
          setIsImporting(false);
          return;
        }
        
        const headerLine = lines[0];
        // 2. Détection automatique du séparateur (, ou ;)
        const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';
        
        // 3. Normalisation des en-têtes (minuscules, sans accents, sans espaces)
        const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '');
        const headers = headerLine.split(delimiter).map(h => normalize(h.trim()));
        
        const prenomIdx = headers.findIndex(h => h === 'prenom' || h === 'firstname' || h === 'name');
        const nomIdx = headers.findIndex(h => h === 'nom' || h === 'lastname' || h === 'surname');
        const telIdx = headers.findIndex(h => h.includes('tel') || h.includes('phone') || h === 'contact' || h === 'numero');
        const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('anniversaire') || h.includes('birth'));

        let importedCount = 0;
        let ignoredCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          
          const p = prenomIdx >= 0 && cols[prenomIdx] ? cols[prenomIdx].trim() : '';
          const n = nomIdx >= 0 && cols[nomIdx] ? cols[nomIdx].trim() : '';
          let t = telIdx >= 0 && cols[telIdx] ? cols[telIdx].trim() : '';
          let d = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx].trim() : '';

          // Nettoyage du téléphone (suppression des espaces)
          t = t.replace(/\s+/g, '');

          // 4. Validation souple : le téléphone ET au moins un nom ou prénom sont requis
          if (!t || (!p && !n)) {
            ignoredCount++;
            continue;
          }

          let finalDate = null;
          if (d) {
            const dateParts = d.split(/[/ -]/);
            if (dateParts.length >= 2) {
              const day = dateParts[0].padStart(2, '0');
              const month = dateParts[1].padStart(2, '0');
              if (!isNaN(day) && !isNaN(month)) {
                finalDate = `${month}-${day}`;
              }
            }
          }

          const payload = {
            prenom: p,
            nom: n,
            telephone: t,
            birthDate: finalDate,
            notes: 'Importé via CSV',
            suiviAppels: [],
            visites: 0,
            visits: 0, // pour correspondre à la demande explicite
            chiffreAffaires: 0,
            totalSpent: 0, // pour correspondre à la demande explicite
            createdAt: serverTimestamp()
          };
          
          await addDoc(collection(db, 'clients'), payload);
          importedCount++;
        }
        
        // 5. Message de confirmation détaillé
        alert(`${importedCount} clients ont été importés avec succès !\n${ignoredCount > 0 ? `${ignoredCount} lignes ignorées (données invalides ou incomplètes).` : ''}`);
        setShowCsvModal(false);
      } catch (err) {
        console.error("Erreur import CSV:", err);
        alert("Une erreur est survenue lors de l'importation du fichier.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Supprimer le client "${c.prenom} ${c.nom}" ? L'historique de ses réservations est conservé.`)) return;
    try {
      await deleteDoc(doc(db, 'clients', c.id));
      await logEvent('CLIENT_DELETE', `Suppression client : ${c.nom}`);
    } catch (err) { console.error(err); }
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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

        {/* ── FILTRES RECHERCHE ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '220px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" className="input-control"
              style={{ paddingLeft: '38px', width: '100%', margin: 0 }}
              placeholder="Rechercher par nom, prénom ou téléphone…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
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
            {filtered.map(client => (
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
                    <button className="btn btn-small"
                      style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                      onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                      title="Voir détails & Historique"
                    >
                      {expandedId === client.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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

                {/* Historique et Suivi (Expansé) */}
                {expandedId === client.id && (() => {
                  const nomComplet = [client.prenom, client.nom].filter(Boolean).join(' ').toLowerCase().trim();
                  const legacyNom = (client.nom || '').toLowerCase().trim();
                  
                  const clientRes = reservations.filter(r => {
                    const rNom = (r.clientNom || '').toLowerCase().trim();
                    return rNom === nomComplet || rNom === legacyNom || (legacyNom && rNom.includes(legacyNom));
                  }).slice(0, 10);
                  
                  const appels = client.suiviAppels || [];

                  return (
                    <div style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px' }}>
                      
                      {/* Colonne gauche : Historique Réservations */}
                      <div style={{ flex: 1, minWidth: '250px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} /> Derniers passages
                        </div>
                        {clientRes.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucun historique de réservation trouvé.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {clientRes.map(r => (
                              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', padding: '8px 12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <div>
                                  <div style={{ color: 'var(--text-main)', fontWeight: '600' }}>{r.serviceNom || 'Prestation'}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.datePrevue}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <span style={{ fontWeight: '700', color: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {r.prixTotal?.toLocaleString('fr-FR')} F
                                  </span>
                                  <span style={{
                                    fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', fontWeight: '600', textTransform: 'uppercase',
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

                      {/* Colonne droite : Suivi d'appels & Notes */}
                      <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        
                        {/* Notes Permanentes (Modifiables à la volée) */}
                        <div style={{ padding: '12px', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                            <span>📝 Notes & Préférences :</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', textTransform: 'none' }}>S'enregistre à la sortie</span>
                          </span>
                          <textarea 
                            className="input-control"
                            style={{ margin: '8px 0 0', width: '100%', resize: 'vertical', minHeight: '60px', backgroundColor: 'var(--bg-card)', fontSize: '0.85rem' }}
                            placeholder="Ex : Coiffeur favori, allergies, style de coupe..."
                            defaultValue={client.notes}
                            onBlur={(e) => handleUpdateQuickNote(client.id, e.target.value)}
                          />
                        </div>

                        {/* Suivi d'appels */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={14} /> Campagne & Suivi d'Appels
                          </div>
                          
                          <form onSubmit={(e) => handleAddCallNote(client.id, e)} style={{ display: 'flex', gap: '8px' }}>
                            <input 
                              type="text" 
                              className="input-control" 
                              placeholder="Note de l'appel (ex: Occupé, Rdv pris pour samedi...)"
                              value={expandedId === client.id ? callNote : ''}
                              onChange={e => setCallNote(e.target.value)}
                              style={{ margin: 0, flex: 1, fontSize: '0.85rem' }}
                            />
                            <button type="submit" className="btn btn-primary" style={{ padding: '0 12px' }} disabled={savingCall === client.id}>
                              <Send size={16} />
                            </button>
                          </form>

                          {appels.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                              {appels.map((appel, idx) => (
                                <div key={idx} style={{ padding: '10px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', borderLeft: '3px solid var(--accent-color)' }}>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    {new Date(appel.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{appel.note}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {appels.length === 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun suivi d'appel enregistré.</div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
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
                Importez une liste de clients depuis un fichier CSV.
              </p>
              
              <div style={{ backgroundColor: 'var(--bg-input)', padding: '16px', borderRadius: '12px', fontSize: '0.9rem' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: '700', color: 'var(--text-main)' }}>Format attendu :</p>
                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>La 1ère ligne doit être l'en-tête (ex: <strong>prenom, nom, telephone, anniversaire</strong>).</li>
                  <li><strong>L'anniversaire est 100% facultatif.</strong> Seul le prénom (ou le nom) est requis.</li>
                  <li>Le séparateur peut être une virgule (,) ou un point-virgule (;).</li>
                  <li>Si vous incluez un anniversaire, le format attendu est <strong>JJ/MM</strong> ou <strong>JJ-MM</strong>.</li>
                </ul>
              </div>

              <div>
                <input 
                  type="file" 
                  accept=".csv" 
                  id="csv-upload" 
                  style={{ display: 'none' }} 
                  onChange={handleCsvUpload} 
                />
                <label 
                  htmlFor="csv-upload" 
                  className="btn btn-primary" 
                  style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer', padding: '14px', width: '100%', fontSize: '1rem' }}
                >
                  {isImporting ? 'Importation en cours...' : 'Sélectionner un fichier CSV'}
                </label>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default Clients;
