import { useState, useEffect, useMemo } from 'react';
import {
  Tag, PlusCircle, Trash2, Edit2, CheckCircle, XCircle, Search,
  Calendar, Percent, Award, Check, X,
  ShoppingBag, Sparkles
} from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { logEvent } from '../utils/audit';
import SuccessModal from './SuccessModal';

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const Promotions = ({ onNavigateToCaisse, onNavigateToReservation }) => {
  const [promotions, setPromotions] = useState([]);
  const [services, setServices] = useState([]);
  const [servicesDomicile, setServicesDomicile] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('toutes'); // 'toutes' | 'actives' | 'inactives'
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Modal Création / Édition
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Formulaire Promotion
  const [formNom, setFormNom] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDateDebut, setFormDateDebut] = useState('');
  const [formDateFin, setFormDateFin] = useState('');
  const [formIsPermanente, setFormIsPermanente] = useState(true);
  const [formActif, setFormActif] = useState(true);
  const [formSoins, setFormSoins] = useState([
    { serviceId: '', serviceNom: '', prixStandard: 0, prixPromo: 0, isDomicile: false }
  ]);

  // Écoute temps réel de Firestore
  useEffect(() => {
    const unsubPromos = onSnapshot(collection(db, 'promotions'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPromotions(data);
    });

    const unsubServices = onSnapshot(collection(db, 'services'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.actif !== false);
      setServices(data);
    });

    const unsubServicesDom = onSnapshot(collection(db, 'services_domicile'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.actif !== false);
      setServicesDomicile(data);
    });

    return () => {
      unsubPromos();
      unsubServices();
      unsubServicesDom();
    };
  }, []);

  // Tous les services combinés pour le sélecteur
  const allAvailableServices = useMemo(() => {
    const list = [];
    services.forEach(s => list.push({ ...s, isDomicile: false, group: 'Salon' }));
    servicesDomicile.forEach(s => list.push({ ...s, isDomicile: true, group: 'À Domicile' }));
    return list;
  }, [services, servicesDomicile]);

  // KPIs
  const stats = useMemo(() => {
    const today = localDateStr();
    let actives = 0;
    let totalUtilisations = 0;
    let totalEconomieEstimee = 0;

    promotions.forEach(p => {
      let isStillValid = p.actif;
      if (!p.isPermanente && p.dateFin && p.dateFin < today) {
        isStillValid = false;
      }
      if (isStillValid) actives++;
      const count = Number(p.countUtilisations) || 0;
      totalUtilisations += count;
      const econo = Number(p.economie) || 0;
      totalEconomieEstimee += econo * count;
    });

    return {
      actives,
      totalUtilisations,
      totalEconomieEstimee,
      totalPacks: promotions.length
    };
  }, [promotions]);

  // Promotions filtrées
  const filteredPromotions = useMemo(() => {
    const today = localDateStr();
    return promotions.filter(p => {
      if (filterStatus === 'actives') {
        if (!p.actif) return false;
        if (!p.isPermanente && p.dateFin && p.dateFin < today) return false;
      }
      if (filterStatus === 'inactives') {
        const isExpired = !p.isPermanente && p.dateFin && p.dateFin < today;
        if (p.actif && !isExpired) return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const inNom = (p.nom || '').toLowerCase().includes(q);
        const inDesc = (p.description || '').toLowerCase().includes(q);
        const inSoins = (p.servicesInclus || []).some(s => (s.serviceNom || '').toLowerCase().includes(q));
        if (!inNom && !inDesc && !inSoins) return false;
      }
      return true;
    });
  }, [promotions, filterStatus, searchTerm]);

  // Calculs en temps réel pour le formulaire
  const formCalculations = useMemo(() => {
    let standard = 0;
    let promo = 0;
    formSoins.forEach(s => {
      standard += Number(s.prixStandard) || 0;
      promo += Number(s.prixPromo) || 0;
    });
    const economie = Math.max(0, standard - promo);
    const pourcentage = standard > 0 ? Math.round((economie / standard) * 100) : 0;
    return {
      standard,
      promo,
      economie,
      pourcentage
    };
  }, [formSoins]);

  // Ouvrir modal de création
  const handleOpenCreate = () => {
    setEditingPromoId(null);
    setFormNom('');
    setFormDescription('');
    setFormDateDebut(localDateStr());
    setFormDateFin('');
    setFormIsPermanente(true);
    setFormActif(true);
    setFormSoins([
      { serviceId: '', serviceNom: '', prixStandard: 0, prixPromo: 0, isDomicile: false }
    ]);
    setIsModalOpen(true);
  };

  // Ouvrir modal d'édition
  const handleOpenEdit = (promo) => {
    setEditingPromoId(promo.id);
    setFormNom(promo.nom || '');
    setFormDescription(promo.description || '');
    setFormDateDebut(promo.dateDebut || '');
    setFormDateFin(promo.dateFin || '');
    setFormIsPermanente(promo.isPermanente !== false);
    setFormActif(promo.actif !== false);
    setFormSoins(
      (promo.servicesInclus && promo.servicesInclus.length > 0)
        ? promo.servicesInclus.map(s => ({
            serviceId: s.serviceId || '',
            serviceNom: s.serviceNom || '',
            prixStandard: Number(s.prixStandard) || 0,
            prixPromo: Number(s.prixPromo) || 0,
            isDomicile: !!s.isDomicile
          }))
        : [{ serviceId: '', serviceNom: '', prixStandard: 0, prixPromo: 0, isDomicile: false }]
    );
    setIsModalOpen(true);
  };

  // Ajout / Suppression / Modification de ligne de soin dans le formulaire
  const handleAddSoinLigne = () => {
    setFormSoins(prev => [
      ...prev,
      { serviceId: '', serviceNom: '', prixStandard: 0, prixPromo: 0, isDomicile: false }
    ]);
  };

  const handleRemoveSoinLigne = (index) => {
    if (formSoins.length <= 1) {
      alert("Une promotion doit contenir au moins un soin.");
      return;
    }
    setFormSoins(prev => prev.filter((_, i) => i !== index));
  };

  const handleServiceSelect = (index, serviceKey) => {
    if (!serviceKey) return;
    const isDom = serviceKey.startsWith('dom_');
    const realId = isDom ? serviceKey.replace('dom_', '') : serviceKey;
    const found = allAvailableServices.find(s => s.id === realId && s.isDomicile === isDom);

    if (found) {
      const prixDef = Number(found.prixDefaut) || 0;
      setFormSoins(prev => {
        const next = [...prev];
        next[index] = {
          serviceId: found.id,
          serviceNom: found.nom,
          prixStandard: prixDef,
          prixPromo: next[index].prixPromo > 0 ? next[index].prixPromo : Math.round(prixDef * 0.8), // suggestion -20% par défaut
          isDomicile: isDom
        };
        return next;
      });
    }
  };

  const handlePrixPromoChange = (index, value) => {
    const p = value === '' ? '' : Math.max(0, Number(value));
    setFormSoins(prev => {
      const next = [...prev];
      next[index] = { ...next[index], prixPromo: p };
      return next;
    });
  };

  // Sauvegarder la promotion
  const handleSavePromo = async (e) => {
    e.preventDefault();
    const cleanNom = formNom.trim();
    if (!cleanNom) {
      alert("Veuillez donner un nom à la promotion.");
      return;
    }

    // Vérifier les soins
    const validSoins = formSoins.filter(s => s.serviceId && s.serviceNom);
    if (validSoins.length === 0) {
      alert("Veuillez sélectionner au moins un soin pour cette promotion.");
      return;
    }

    setIsSaving(true);
    try {
      let totStandard = 0;
      let totPromo = 0;
      validSoins.forEach(s => {
        totStandard += Number(s.prixStandard) || 0;
        totPromo += Number(s.prixPromo) || 0;
      });
      const econo = Math.max(0, totStandard - totPromo);
      const econoPct = totStandard > 0 ? Math.round((econo / totStandard) * 100) : 0;

      const promoData = {
        nom: cleanNom,
        description: formDescription.trim(),
        dateDebut: formIsPermanente ? '' : (formDateDebut || localDateStr()),
        dateFin: formIsPermanente ? '' : (formDateFin || ''),
        isPermanente: formIsPermanente,
        actif: formActif,
        servicesInclus: validSoins,
        prixTotalStandard: totStandard,
        prixTotalPromo: totPromo,
        economie: econo,
        economiePourcentage: econoPct,
        updatedAt: new Date().toISOString()
      };

      if (editingPromoId) {
        await updateDoc(doc(db, 'promotions', editingPromoId), promoData);
        await logEvent('PROMOTION_UPDATE', `Modification de la promotion [${cleanNom}] — Total: ${totPromo} FCFA au lieu de ${totStandard} FCFA`);
        setSuccessMessage("Promotion mise à jour avec succès !");
      } else {
        promoData.createdAt = new Date().toISOString();
        promoData.countUtilisations = 0;
        await addDoc(collection(db, 'promotions'), promoData);
        await logEvent('PROMOTION_CREATE', `Création de la promotion [${cleanNom}] — Total: ${totPromo} FCFA au lieu de ${totStandard} FCFA (Économie: ${econo} FCFA)`);
        setSuccessMessage("Nouvelle promotion enregistrée avec succès !");
      }

      setIsModalOpen(false);
      setShowSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement de la promotion.");
    } finally {
      setIsSaving(false);
    }
  };

  // Basculer l'état Actif / Inactif
  const handleToggleActif = async (promo) => {
    try {
      const newStatus = !promo.actif;
      await updateDoc(doc(db, 'promotions', promo.id), {
        actif: newStatus,
        updatedAt: new Date().toISOString()
      });
      await logEvent('PROMOTION_TOGGLE', `Promotion [${promo.nom}] passée en statut: ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du changement de statut.");
    }
  };

  // Supprimer une promotion
  const handleDeletePromo = async (promo) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement la promotion « ${promo.nom} » ?`)) {
      try {
        await deleteDoc(doc(db, 'promotions', promo.id));
        await logEvent('PROMOTION_DELETE', `Suppression de la promotion [${promo.nom}]`);
        setSuccessMessage("Promotion supprimée avec succès.");
        setShowSuccess(true);
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la suppression.");
      }
    }
  };

  // Statut visuel d'une promotion
  const getPromoStatus = (promo) => {
    const today = localDateStr();
    if (!promo.actif) {
      return { label: 'Inactive', color: 'var(--text-muted)', bg: 'var(--bg-input)' };
    }
    if (!promo.isPermanente && promo.dateFin && promo.dateFin < today) {
      return { label: 'Expirée', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' };
    }
    if (!promo.isPermanente && promo.dateDebut && promo.dateDebut > today) {
      return { label: 'À venir', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)' };
    }
    return { label: 'En cours (Active)', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.12)' };
  };

  return (
    <div className="view-container">
      {showSuccess && <SuccessModal message={successMessage} onClose={() => setShowSuccess(false)} />}

      {/* ── EN-TÊTE PRINCIPAL ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Tag size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Système de Promotions & Packs
              </h1>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Créez des offres spéciales avec tarifs réduits applicables en 1 clic en Caisse et en Réservation.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="btn btn-primary"
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
          }}
        >
          <PlusCircle size={18} /> Nouvelle Promotion
        </button>
      </div>

      {/* ── CARTES KPI ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Promotions Actives
            </span>
            <Sparkles size={18} color="var(--success)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--success)' }}>
            {stats.actives}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Sur un total de {stats.totalPacks} pack(s)
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Réservations & Ventes Promo
            </span>
            <ShoppingBag size={18} color="var(--accent-color)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent-color)' }}>
            {stats.totalUtilisations}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Utilisations enregistrées au salon
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Économie Totale Offerte
            </span>
            <Percent size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#F59E0B' }}>
            {stats.totalEconomieEstimee.toLocaleString('fr-FR')} FCFA
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Avantage cumulé accordé aux clients
          </div>
        </div>
      </div>

      {/* ── BARRE DE RECHERCHE ET FILTRES ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="input-control"
              style={{ margin: 0, paddingLeft: '42px', minHeight: '44px' }}
              placeholder="Rechercher par nom de promo, soin inclus..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-input)', padding: '4px', borderRadius: '10px' }}>
            {[
              { key: 'toutes', label: 'Toutes' },
              { key: 'actives', label: 'Actives' },
              { key: 'inactives', label: 'Inactives / Expirées' }
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                className="btn btn-small"
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: filterStatus === tab.key ? 'var(--btn-primary-bg)' : 'transparent',
                  color: filterStatus === tab.key ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                  border: 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── GRILLE DES PROMOTIONS ────────────────────────────────────────── */}
      {filteredPromotions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <Tag size={42} style={{ opacity: 0.25, margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginBottom: '6px' }}>
            Aucune promotion trouvée
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px' }}>
            {searchTerm || filterStatus !== 'toutes'
              ? 'Aucune promotion ne correspond à vos filtres actuels.'
              : 'Vous n\'avez pas encore créé de promotion. Cliquez sur le bouton ci-dessous pour lancer votre première offre !'}
          </p>
          <button onClick={handleOpenCreate} className="btn btn-primary" style={{ padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={16} /> Créer ma première promotion
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '18px'
        }}>
          {filteredPromotions.map(promo => {
            const status = getPromoStatus(promo);
            const soinsInclus = promo.servicesInclus || [];

            return (
              <div
                key={promo.id}
                className="card"
                style={{
                  marginBottom: 0,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  border: promo.actif ? '1px solid var(--border-color)' : '1px solid rgba(255,255,255,0.06)',
                  opacity: promo.actif ? 1 : 0.75,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Ruban haut décoratif */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  backgroundColor: promo.actif ? 'var(--accent)' : 'var(--border-color)'
                }} />

                <div>
                  {/* Statut & badge économie */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      backgroundColor: status.bg,
                      color: status.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      {promo.actif ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {status.label}
                    </span>

                    {promo.economiePourcentage > 0 && (
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Award size={13} /> -{promo.economiePourcentage}%
                      </span>
                    )}
                  </div>

                  {/* Titre et description */}
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                    {promo.nom}
                  </h3>
                  {promo.description && (
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      {promo.description}
                    </p>
                  )}

                  {/* Période de validité */}
                  <div style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '14px',
                    backgroundColor: 'var(--bg-input)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    width: 'fit-content'
                  }}>
                    <Calendar size={13} />
                    {promo.isPermanente ? (
                      <span>Offre Permanente (Toujours active)</span>
                    ) : (
                      <span>
                        Du {promo.dateDebut ? new Date(promo.dateDebut).toLocaleDateString('fr-FR') : 'début'} au {promo.dateFin ? new Date(promo.dateFin).toLocaleDateString('fr-FR') : 'illimité'}
                      </span>
                    )}
                  </div>

                  {/* Liste des soins inclus avec prix barrés et prix promo */}
                  <div style={{
                    backgroundColor: 'var(--bg-main)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    border: '1px solid var(--border-color)',
                    marginBottom: '14px'
                  }}>
                    <div style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      marginBottom: '8px'
                    }}>
                      Soins inclus dans ce pack ({soinsInclus.length})
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {soinsInclus.map((s, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.85rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--accent)' }}>•</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {s.serviceNom}
                            </span>
                            {s.isDomicile && (
                              <span style={{ fontSize: '0.68rem', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)', padding: '2px 5px', borderRadius: '4px' }}>
                                Domicile
                              </span>
                            )}
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {Number(s.prixStandard) > Number(s.prixPromo) && (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                                {Number(s.prixStandard).toLocaleString('fr-FR')} F
                              </span>
                            )}
                            <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                              {Number(s.prixPromo).toLocaleString('fr-FR')} F
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Récapitulatif Tarif Global */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Tarif promotionnel pack
                      </div>
                      <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--success)' }}>
                        {Number(promo.prixTotalPromo || 0).toLocaleString('fr-FR')} FCFA
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                        {Number(promo.prixTotalStandard || 0).toLocaleString('fr-FR')} FCFA
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F59E0B' }}>
                        Économie : -{Number(promo.economie || 0).toLocaleString('fr-FR')} F
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer de la carte: Compteur d'utilisations et boutons d'actions */}
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '12px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShoppingBag size={13} /> Utilisé <strong>{promo.countUtilisations || 0} fois</strong>
                    </span>
                    <span>
                      {promo.updatedAt
                        ? `Modifié le ${new Date(promo.updatedAt).toLocaleDateString('fr-FR')}`
                        : promo.createdAt
                          ? `Créé le ${new Date(promo.createdAt).toLocaleDateString('fr-FR')}`
                          : ''}
                    </span>
                  </div>

                  {/* Boutons d'utilisation rapide en Caisse et Réservations */}
                  {promo.actif && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      {onNavigateToCaisse && (
                        <button
                          type="button"
                          onClick={() => onNavigateToCaisse(promo)}
                          className="btn btn-primary"
                          style={{
                            flex: 1,
                            minHeight: '36px',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '6px 8px'
                          }}
                          title="Encaisser ce pack en caisse"
                        >
                          <ShoppingBag size={13} /> Encaisser en Caisse
                        </button>
                      )}

                      {onNavigateToReservation && (
                        <button
                          type="button"
                          onClick={() => onNavigateToReservation(promo)}
                          className="btn"
                          style={{
                            flex: 1,
                            minHeight: '36px',
                            fontSize: '0.78rem',
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            color: 'var(--accent-color)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '6px 8px'
                          }}
                          title="Créer une réservation avec ce pack"
                        >
                          <Calendar size={13} /> Réserver ce pack
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleActif(promo)}
                      className="btn"
                      style={{
                        flex: 1,
                        minHeight: '38px',
                        padding: '6px 10px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        backgroundColor: promo.actif ? 'var(--bg-input)' : 'rgba(16, 185, 129, 0.15)',
                        color: promo.actif ? 'var(--text-muted)' : 'var(--success)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px'
                      }}
                      title={promo.actif ? 'Désactiver cette promotion' : 'Activer cette promotion'}
                    >
                      {promo.actif ? 'Désactiver' : 'Activer'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(promo)}
                      className="btn"
                      style={{
                        padding: '6px 12px',
                        minHeight: '38px',
                        fontSize: '0.8rem',
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px'
                      }}
                      title="Modifier les détails ou les prix de cette promotion"
                    >
                      <Edit2 size={14} /> Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePromo(promo)}
                      className="btn"
                      style={{
                        padding: '6px 10px',
                        minHeight: '38px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        color: 'var(--danger)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '8px'
                      }}
                      title="Supprimer la promotion"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL CRÉATION / ÉDITION DE PROMOTION ─────────────────────────── */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => !isSaving && setIsModalOpen(false)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '640px', width: '95%', maxHeight: '92vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Tag size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                    {editingPromoId ? 'Modifier la Promotion' : 'Nouvelle Promotion'}
                  </h2>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Configurez les soins inclus et leurs prix promotionnels
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="btn-icon"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePromo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Nom & Description */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Nom de la promotion *
                </label>
                <input
                  type="text"
                  className="input-control"
                  style={{ minHeight: '46px', fontSize: '0.95rem', fontWeight: 700 }}
                  placeholder="Ex: Pack Spécial Soin Visage & Barbe, Promo Week-end..."
                  value={formNom}
                  onChange={e => setFormNom(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Description / Conditions (Optionnel)
                </label>
                <textarea
                  className="input-control"
                  rows={2}
                  style={{ resize: 'vertical' }}
                  placeholder="Ex: Valable du lundi au jeudi, réservé aux clients fidèles..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                />
              </div>

              {/* Période de validité */}
              <div style={{
                backgroundColor: 'var(--bg-input)',
                borderRadius: '12px',
                padding: '14px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} color="var(--accent)" /> Période de validité
                  </span>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formIsPermanente}
                      onChange={e => setFormIsPermanente(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Offre permanente</span>
                  </label>
                </div>

                {!formIsPermanente && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>Date début</label>
                      <input
                        type="date"
                        className="input-control"
                        style={{ margin: 0, minHeight: '42px' }}
                        value={formDateDebut}
                        onChange={e => setFormDateDebut(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>Date fin</label>
                      <input
                        type="date"
                        className="input-control"
                        style={{ margin: 0, minHeight: '42px' }}
                        value={formDateFin}
                        onChange={e => setFormDateFin(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Constructeur des Soins Inclus */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} color="#F59E0B" /> Soins inclus dans la promotion ({formSoins.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSoinLigne}
                    className="btn btn-small"
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--accent-color)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <PlusCircle size={14} /> + Ajouter un soin
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {formSoins.map((soin, index) => (
                    <div
                      key={index}
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Soin #{index + 1}
                        </span>
                        {formSoins.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSoinLigne(index)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                            title="Retirer ce soin"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.8fr) minmax(130px, 1fr)', gap: '10px', alignItems: 'center' }}>
                        {/* Sélecteur de service */}
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>
                            Prestation / Soin
                          </label>
                          <select
                            className="input-control"
                            style={{ margin: 0, minHeight: '44px', fontSize: '0.9rem' }}
                            value={soin.isDomicile ? `dom_${soin.serviceId}` : soin.serviceId}
                            onChange={e => handleServiceSelect(index, e.target.value)}
                            required
                          >
                            <option value="">-- Choisir un soin --</option>
                            <optgroup label="Prestations au salon">
                              {services.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.nom} ({Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA)
                                </option>
                              ))}
                            </optgroup>
                            {servicesDomicile.length > 0 && (
                              <optgroup label="Prestations à domicile">
                                {servicesDomicile.map(s => (
                                  <option key={`dom_${s.id}`} value={`dom_${s.id}`}>
                                    {s.nom} (Domicile - {Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        {/* Prix promotionnel */}
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'block' }}>
                            Prix Promo (FCFA)
                          </label>
                          <input
                            type="number"
                            min="0"
                            className="input-control"
                            style={{ margin: 0, minHeight: '44px', fontWeight: 800, color: 'var(--success)', fontSize: '1rem' }}
                            value={soin.prixPromo}
                            onChange={e => handlePrixPromoChange(index, e.target.value)}
                            placeholder="Prix promo"
                            required
                          />
                        </div>
                      </div>

                      {/* Indicateur de réduction sur ce soin */}
                      {soin.prixStandard > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                          <span>Prix normal : <strong>{Number(soin.prixStandard).toLocaleString('fr-FR')} FCFA</strong></span>
                          {Number(soin.prixStandard) > Number(soin.prixPromo) ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                              Réduction : -{(Number(soin.prixStandard) - Number(soin.prixPromo)).toLocaleString('fr-FR')} F
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Sans réduction</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Récapitulatif instantané en temps réel */}
              <div style={{
                borderRadius: '12px',
                padding: '14px 18px',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1.5px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Total Pack Promotionnel
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--success)', letterSpacing: '-0.02em' }}>
                    {formCalculations.promo.toLocaleString('fr-FR')} FCFA
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                    Au lieu de {formCalculations.standard.toLocaleString('fr-FR')} FCFA
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Award size={14} /> Économie : {formCalculations.economie.toLocaleString('fr-FR')} FCFA (-{formCalculations.pourcentage}%)
                  </div>
                </div>
              </div>

              {/* Bouton de validation */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{ flex: 2, minHeight: '48px', fontSize: '1rem', fontWeight: 700 }}
                >
                  <Check size={18} style={{ marginRight: '6px' }} />
                  {isSaving ? 'Enregistrement en cours...' : (editingPromoId ? 'Mettre à jour la promotion' : 'Enregistrer la promotion')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="btn"
                  style={{ flex: 1, minHeight: '48px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promotions;
