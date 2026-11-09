import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { PlusCircle, Trash2, Users, Search, UserPlus, X, CheckCircle, Tag, Sparkles, ShoppingBag } from 'lucide-react';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * PanierPrestations — Panier multi-services avec gestion du Billard sans agent,
 * création de client, et prise en charge native des Promotions et Packs.
 */
const PanierPrestations = ({
  lignes,
  setLignes,
  services = [],
  servicesDomicile = [],
  employes = [],
  clientNom = '',
  setClientNom,
  modePaiement = 'Cash',
  setModePaiement,
  showClientField = true,
  hidePayment = false,
  clients = [],
  setClientId,
  prefilledPromotion = null,
  onClearPrefilledPromotion = null,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ nom: '', prenom: '', telephone: '' });
  const [isSavingClient, setIsSavingClient] = useState(false);
  const dropdownRef = useRef(null);
  const [showBillardAgentsMap, setShowBillardAgentsMap] = useState({});

  const toggleBillardAgentPicker = (index) => {
    setShowBillardAgentsMap(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Promotions disponibles
  const [promotions, setPromotions] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promotions'), (snap) => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => {
          if (!p.actif) return false;
          if (!p.isPermanente && p.dateFin && p.dateFin < today) return false;
          return true;
        });
      setPromotions(data);
    });
    return () => unsub();
  }, []);

  // Détection de promotion active dans le panier
  const promoActiveInfo = useMemo(() => {
    const promoLine = (lignes || []).find(l => l.promotionNom || l.promotionId);
    if (!promoLine) return null;
    const promoNom = promoLine.promotionNom;
    const promoId = promoLine.promotionId;
    const fullPromo = promotions.find(p => p.id === promoId || p.nom === promoNom);
    const totalEconomie = (lignes || []).reduce((sum, l) => {
      if (l.promotionNom === promoNom && l.prixBase && l.prixFinal) {
        return sum + Math.max(0, Number(l.prixBase) - Number(l.prixFinal));
      }
      return sum;
    }, 0);

    return {
      id: promoId,
      nom: promoNom,
      economie: totalEconomie || (fullPromo ? fullPromo.economie : 0),
      fullPromo
    };
  }, [lignes, promotions]);

  // Appliquer une promotion au panier
  const applyPromotion = useCallback((promo) => {
    if (!promo || !promo.servicesInclus || promo.servicesInclus.length === 0) {
      alert("Cette promotion ne contient aucun soin.");
      return;
    }

    const promoLines = promo.servicesInclus.map(s => {
      const base = Number(s.prixStandard) || Number(s.prixPromo);
      const promoP = Number(s.prixPromo);
      const diff = Math.max(0, base - promoP);

      return {
        serviceId: s.serviceId,
        serviceNom: s.serviceNom,
        isBillard: false,
        prixBase: base,
        prixFinal: promoP,
        agents: [],
        remiseType: diff > 0 ? 'fixe' : 'aucune',
        remiseValeur: diff > 0 ? diff : '',
        remiseMotif: `Promo : ${promo.nom}`,
        promotionId: promo.id,
        promotionNom: promo.nom,
        isPromo: true,
        isDomicile: !!s.isDomicile
      };
    });

    setLignes(prev => {
      if (prev.length === 1 && !prev[0].serviceId) {
        return promoLines;
      }
      const withoutSamePromo = prev.filter(l => l.promotionId !== promo.id);
      return [...withoutSamePromo, ...promoLines];
    });

    setShowPromoModal(false);
  }, [setLignes]);

  // Retirer une promotion du panier
  const removePromotion = useCallback((promoId) => {
    setLignes(prev => {
      const filtered = prev.filter(l => l.promotionId !== promoId && (!l.promotionNom || l.promotionId));
      if (filtered.length === 0) {
        return [{
          serviceId: '',
          serviceNom: '',
          isBillard: false,
          prixBase: '',
          prixFinal: '',
          agents: [],
          remiseType: 'aucune',
          remiseValeur: '',
          remiseMotif: '',
        }];
      }
      return filtered;
    });
  }, [setLignes]);

  // Application automatique de la promotion pré-remplie
  const appliedPromoRef = useRef(null);
  useEffect(() => {
    if (prefilledPromotion && appliedPromoRef.current !== prefilledPromotion) {
      appliedPromoRef.current = prefilledPromotion;
      const timer = setTimeout(() => {
        applyPromotion(prefilledPromotion);
        if (onClearPrefilledPromotion) onClearPrefilledPromotion();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [prefilledPromotion, applyPromotion, onClearPrefilledPromotion]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = (clients || []).filter(c => {
    if (!clientNom) return true;
    const q = clientNom.toLowerCase();
    const cNom = (c.nom || '').toLowerCase();
    const cPrenom = (c.prenom || '').toLowerCase();
    const cTel = (c.telephone || '').toLowerCase();
    return cNom.includes(q) || cPrenom.includes(q) || cTel.includes(q);
  });

  const handleSelectClient = (c) => {
    const fullName = [c.prenom, c.nom].filter(Boolean).join(' ');
    setClientNom(fullName);
    if (setClientId) setClientId(c.id);
    setShowDropdown(false);
  };

  const openAddClientModal = (initialName = '') => {
    const search = (initialName || clientNom || '').trim();
    let prenom = '', nom = '';
    if (search) {
      const parts = search.split(/\s+/);
      if (parts.length > 1) {
        prenom = parts[0];
        nom = parts.slice(1).join(' ');
      } else {
        prenom = search;
      }
    }
    setNewClientForm({ prenom, nom, telephone: '' });
    setShowAddClientModal(true);
    setShowDropdown(false);
  };

  const handleSaveNewClient = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!newClientForm.nom.trim() && !newClientForm.prenom.trim()) {
      alert("Veuillez renseigner au moins un prénom ou un nom.");
      return;
    }
    setIsSavingClient(true);
    try {
      const docRef = await addDoc(collection(db, 'clients'), {
        nom: newClientForm.nom.trim(),
        prenom: newClientForm.prenom.trim(),
        telephone: newClientForm.telephone.trim(),
        suiviAppels: [],
        createdAt: new Date().toISOString()
      });
      const fullName = [newClientForm.prenom, newClientForm.nom].filter(Boolean).join(' ');
      setClientNom(fullName);
      if (setClientId) setClientId(docRef.id);
      setShowAddClientModal(false);
      setShowDropdown(false);
      setNewClientForm({ nom: '', prenom: '', telephone: '' });
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création du client.");
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleQuickCreateClient = async (name) => {
    const cleanName = (name || '').trim();
    if (!cleanName) return;
    setIsSavingClient(true);
    try {
      const parts = cleanName.split(/\s+/);
      const prenom = parts[0] || cleanName;
      const nom = parts.slice(1).join(' ') || '';
      const docRef = await addDoc(collection(db, 'clients'), {
        nom,
        prenom,
        telephone: '',
        suiviAppels: [],
        createdAt: new Date().toISOString()
      });
      setClientNom(cleanName);
      if (setClientId) setClientId(docRef.id);
      setShowDropdown(false);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création du client.");
    } finally {
      setIsSavingClient(false);
    }
  };

  const totalGeneral = (lignes || []).reduce((acc, l) => acc + Number(l.prixFinal || 0), 0);

  const addLigne = (defaultCat = 'toutes') => {
    try {
      setLignes(prev => [...prev, {
        serviceId: '',
        serviceNom: '',
        categorieFilter: defaultCat,
        categorieService: defaultCat === 'boisson' ? 'boisson' : 'salon',
        isBoisson: defaultCat === 'boisson',
        isBillard: false,
        prixBase: '',
        prixFinal: '',
        agents: [],
        remiseType: 'aucune',
        remiseValeur: '',
        remiseMotif: '',
      }]);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de l\'ajout de la prestation.');
    }
  };

  const addBoissonLigne = () => {
    addLigne('boisson');
  };

  const clearLineAgents = (idx) => {
    setLignes(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], agents: [] };
      return updated;
    });
  };

  const changeBillardParties = (index, delta) => {
    setLignes(prev => {
      const updated = [...prev];
      const current = { ...updated[index] };
      const currentP = Number(current.nombreParties) || 1;
      const nextP = Math.max(1, currentP + delta);
      current.nombreParties = nextP;
      const uPrice = current.prixUnitaire !== undefined && current.prixUnitaire !== '' ? Number(current.prixUnitaire) : 500;
      current.prixUnitaire = uPrice;
      const baseCalc = nextP * uPrice;
      current.prixBase = baseCalc;
      if (current.remiseType === 'offert') {
        current.prixFinal = 0;
      } else if (current.remiseType === 'pourcentage') {
        const pct = Number(current.remiseValeur) || 0;
        current.prixFinal = Math.max(0, baseCalc - (baseCalc * pct / 100));
      } else if (current.remiseType === 'fixe') {
        const fix = Number(current.remiseValeur) || 0;
        current.prixFinal = Math.max(0, baseCalc - fix);
      } else {
        current.prixFinal = baseCalc;
      }
      updated[index] = current;
      return updated;
    });
  };

  const setBillardPartiesPreset = (index, nbParties) => {
    setLignes(prev => {
      const updated = [...prev];
      const current = { ...updated[index] };
      current.nombreParties = nbParties;
      const uPrice = current.prixUnitaire !== undefined && current.prixUnitaire !== '' ? Number(current.prixUnitaire) : 500;
      current.prixUnitaire = uPrice;
      const baseCalc = nbParties * uPrice;
      current.prixBase = baseCalc;
      if (current.remiseType === 'offert') {
        current.prixFinal = 0;
      } else if (current.remiseType === 'pourcentage') {
        const pct = Number(current.remiseValeur) || 0;
        current.prixFinal = Math.max(0, baseCalc - (baseCalc * pct / 100));
      } else if (current.remiseType === 'fixe') {
        const fix = Number(current.remiseValeur) || 0;
        current.prixFinal = Math.max(0, baseCalc - fix);
      } else {
        current.prixFinal = baseCalc;
      }
      updated[index] = current;
      return updated;
    });
  };

  const addBillardLigne = () => {
    try {
      setLignes(prev => [...prev, {
        serviceId: 'billard',
        serviceNom: 'Billard',
        categorieFilter: 'loisirs',
        categorieService: 'loisirs',
        isBoisson: false,
        isBillard: true,
        nombreParties: 1,
        prixUnitaire: 500,
        prixBase: 500,
        prixFinal: 500,
        agents: [],
        remiseType: 'aucune',
        remiseValeur: '',
        remiseMotif: '',
      }]);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de l\'ajout du billard.');
    }
  };

  const removeLigne = (index) => {
    try {
      setLignes(prev => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          return [{
            serviceId: '',
            serviceNom: '',
            isBillard: false,
            prixBase: '',
            prixFinal: '',
            agents: [],
            remiseType: 'aucune',
            remiseValeur: '',
            remiseMotif: '',
          }];
        }
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la suppression de la prestation.');
    }
  };

  const updateLigne = (index, field, value) => {
    try {
      setLignes(prev => {
        const updated = [...prev];
        const current = { ...updated[index] };

        // Changement de filtre de catégorie sur la ligne
        if (field === 'categorieFilter') {
          current.categorieFilter = value;
          if (value === 'loisirs') {
            current.serviceId = 'billard';
            current.serviceNom = 'Billard';
            current.categorieService = 'loisirs';
            current.isBillard = true;
            current.isBoisson = false;
            current.nombreParties = current.nombreParties || 1;
            current.prixUnitaire = current.prixUnitaire !== undefined && current.prixUnitaire !== '' ? Number(current.prixUnitaire) : 500;
            current.prixBase = (Number(current.nombreParties) || 1) * current.prixUnitaire;
            current.prixFinal = current.prixBase;
          } else {
            current.isBillard = false;
            current.isBoisson = value === 'boisson';
            current.categorieService = value === 'boisson' ? 'boisson' : 'salon';
            current.serviceId = '';
            current.serviceNom = '';
            current.prixBase = '';
            current.prixFinal = '';
          }
          updated[index] = current;
          return updated;
        }

        // Changement de service
        if (field === 'serviceId') {
          if (value === 'billard' || value === 'service_billard') {
            current.serviceId = 'billard';
            current.serviceNom = 'Billard';
            current.categorieService = 'loisirs';
            current.isBillard = true;
            current.isBoisson = false;
            current.nombreParties = current.nombreParties || 1;
            current.prixUnitaire = current.prixUnitaire !== undefined && current.prixUnitaire !== '' ? Number(current.prixUnitaire) : 500;
            current.prixBase = (Number(current.nombreParties) || 1) * current.prixUnitaire;
            current.prixFinal = current.prixBase;
            current.remiseType = 'aucune';
            current.remiseValeur = '';
            current.agents = current.agents || [];
            current.isPromo = false;
            current.promotionId = null;
            current.promotionNom = null;
            updated[index] = current;
            return updated;
          }

          const isDomicile = value.startsWith('dom_');
          const realId = isDomicile ? value.replace('dom_', '') : value;
          const service = isDomicile ? (servicesDomicile || []).find(s => s.id === realId) : services.find(s => s.id === realId);
          if (service) {
            const isBillard = service.categorie === 'loisirs' || (service.nom || '').toLowerCase().includes('billard');
            const isBoisson = !isDomicile && service.categorie === 'boisson';
            current.serviceId = realId;
            current.serviceNom = service.nom;
            current.categorieService = isBillard ? 'loisirs' : isBoisson ? 'boisson' : 'salon';
            current.isBillard = isBillard;
            current.isBoisson = isBoisson;
            if (isBillard) {
              current.nombreParties = current.nombreParties || 1;
              current.prixUnitaire = Number(service.prixDefaut) || 500;
              current.prixBase = (Number(current.nombreParties) || 1) * current.prixUnitaire;
              current.prixFinal = current.prixBase;
            } else {
              current.prixBase = service.prixDefaut;
              current.prixFinal = service.prixDefaut;
            }
            current.remiseType = 'aucune';
            current.remiseValeur = '';
            current.isDomicile = isDomicile;
            current.isPromo = false;
            current.promotionId = null;
            current.promotionNom = null;
          }
          updated[index] = current;
          return updated;
        }

        // Nombre de parties de billard
        if (field === 'nombreParties') {
          current.nombreParties = value;
          const uPrice = current.prixUnitaire !== undefined && current.prixUnitaire !== '' ? Number(current.prixUnitaire) : 500;
          current.prixUnitaire = uPrice;
          const p = value === '' ? 0 : Math.max(1, parseInt(value, 10) || 1);
          const totalCalc = p * uPrice;
          current.prixBase = totalCalc;
          current.prixFinal = totalCalc;
          updated[index] = current;
          return updated;
        }

        // Prix par partie de billard
        if (field === 'prixUnitaire') {
          current.prixUnitaire = value;
          const uPrice = value === '' ? 0 : Math.max(0, Number(value));
          const parties = current.nombreParties === '' ? 1 : Math.max(1, parseInt(current.nombreParties, 10) || 1);
          const totalCalc = parties * uPrice;
          current.prixBase = totalCalc;
          current.prixFinal = totalCalc;
          updated[index] = current;
          return updated;
        }

        // Modification libre du prix final
        if (field === 'prixFinal') {
          current.prixFinal = value;
          current.prixBase = value;
          updated[index] = current;
          return updated;
        }

        current[field] = value;

        // Recalcul du prix final avec remise
        if (['remiseType', 'remiseValeur', 'prixBase'].includes(field)) {
          const base = Number(current.prixBase) || 0;

          if (field === 'remiseType' && value === 'offert') {
            current.remiseValeur = '0';
            current.remiseMotif = 'Soin Offert';
            current.prixFinal = 0;
          } else if (current.remiseType === 'offert') {
            current.prixFinal = 0;
          } else if (current.remiseType === 'pourcentage') {
            const pct = Number(current.remiseValeur) || 0;
            current.prixFinal = Math.max(0, base - (base * pct / 100));
          } else if (current.remiseType === 'fixe') {
            const montantRemise = Number(current.remiseValeur) || 0;
            current.prixFinal = Math.max(0, base - montantRemise);
          } else {
            current.prixFinal = base;
          }
        }

        updated[index] = current;
        return updated;
      });
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la mise à jour de la prestation.');
    }
  };

  const toggleAgent = (index, employe) => {
    try {
      setLignes(prev => {
        const updated = [...prev];
        const ligne = { ...updated[index] };
        const safeAgents = ligne.agents || [];
        const exists = safeAgents.some(a => a.id === employe.id);
        if (exists) {
          ligne.agents = safeAgents.filter(a => a.id !== employe.id);
        } else {
          ligne.agents = [...safeAgents, { id: employe.id, nom: employe.nom }];
        }
        updated[index] = ligne;
        return updated;
      });
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la modification de l\'agent.');
    }
  };

  return (
    <div>
      {/* Sélecteur de client */}
      {showClientField && (
        <div className="form-group" style={{ marginBottom: '15px', position: 'relative' }} ref={dropdownRef}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Client (Sélectionner, créer ou saisir librement)</span>
            <button 
              type="button" 
              onClick={() => openAddClientModal(clientNom)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', fontWeight: 'bold' }}
            >
              <UserPlus size={14} /> Nouveau client
            </button>
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="input-control"
              style={{ paddingLeft: '38px', margin: 0 }}
              placeholder="Rechercher un client ou saisir un nom libre..."
              value={clientNom}
              onChange={e => {
                setClientNom(e.target.value);
                if (setClientId) setClientId(null);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>
          {showDropdown && clientNom && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, 
              backgroundColor: 'var(--bg-card)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)', 
              zIndex: 100,
              marginTop: '4px',
              maxHeight: '300px', overflowY: 'auto'
            }}>
              {filteredClients.length > 0 ? (
                <>
                  {filteredClients.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => handleSelectClient(c)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-input)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', flexShrink: 0 }}>
                        {(c.prenom ? c.prenom[0] : (c.nom || '?')[0]).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)' }}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</div>
                        {c.telephone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.telephone}</div>}
                      </div>
                    </div>
                  ))}
                  {!filteredClients.some(c => [c.prenom, c.nom].filter(Boolean).join(' ').toLowerCase() === clientNom.toLowerCase().trim()) && (
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Créer « {clientNom} » dans le répertoire ?</span>
                      <button 
                        type="button" 
                        className="btn btn-small btn-primary"
                        onClick={() => handleQuickCreateClient(clientNom)}
                        disabled={isSavingClient}
                      >
                        Enregistrer
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span>Aucun client existant pour « {clientNom} »</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => handleQuickCreateClient(clientNom)} disabled={isSavingClient}>
                      Créer en 1 clic
                    </button>
                    <button type="button" className="btn btn-small" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-main)' }} onClick={() => openAddClientModal(clientNom)}>
                      Détails (+ tél)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Add Client */}
      {showAddClientModal && (
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAddClientModal(false)}
        >
          <div 
            style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 12px 36px rgba(0,0,0,0.4)', border: '1px solid var(--border-color)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                <UserPlus size={18} color="var(--accent)" /> Nouveau Client
              </h3>
              <button type="button" onClick={() => setShowAddClientModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom</label>
                <input type="text" className="input-control" value={newClientForm.prenom} onChange={e => setNewClientForm({...newClientForm, prenom: e.target.value})} placeholder="Ex: Moussa" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom</label>
                <input type="text" className="input-control" value={newClientForm.nom} onChange={e => setNewClientForm({...newClientForm, nom: e.target.value})} placeholder="Ex: Bello" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone (Optionnel)</label>
                <input type="tel" className="input-control" value={newClientForm.telephone} onChange={e => setNewClientForm({...newClientForm, telephone: e.target.value})} placeholder="Ex: +227 90 00 00 00" />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  disabled={isSavingClient} 
                  style={{ flex: 2 }}
                  onClick={handleSaveNewClient}
                >
                  <CheckCircle size={18} /> {isSavingClient ? 'Création...' : 'Créer et Sélectionner'}
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                  onClick={() => setShowAddClientModal(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'action rapide pour prestations, Boissons, Billard et PROMOTIONS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => addLigne('salon')}
          className="btn btn-small"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusCircle size={15} /> ✂️ + Prestation Salon
        </button>

        <button
          type="button"
          onClick={addBoissonLigne}
          className="btn btn-small"
          style={{ backgroundColor: 'rgba(236, 72, 153, 0.12)', color: '#ec4899', border: '1px solid rgba(236, 72, 153, 0.45)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          🍹 + Boisson / Cocktail
        </button>

        <button
          type="button"
          onClick={addBillardLigne}
          className="btn btn-small"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          🎱 + Billard (500 F - Sans agent)
        </button>

        {promotions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPromoModal(true)}
            className="btn btn-small"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              color: '#F59E0B',
              border: '1.5px solid rgba(245, 158, 11, 0.45)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 800
            }}
          >
            <Tag size={15} /> 🎁 Appliquer une Promotion ({promotions.length})
          </button>
        )}
      </div>

      {/* BANDEAU PROMOTION ACTIVE (Si une promotion est appliquée dans le panier) */}
      {promoActiveInfo && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Promotion active : {promoActiveInfo.nom}
                <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: '10px' }}>
                  Pack Appliqué
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Tarif promotionnel spécial inclus • Économie client : <strong style={{ color: '#F59E0B' }}>-{Number(promoActiveInfo.economie || 0).toLocaleString('fr-FR')} FCFA</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowPromoModal(true)}
              className="btn btn-small"
              style={{
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '0.78rem',
                padding: '5px 10px'
              }}
            >
              Changer de pack
            </button>
            <button
              type="button"
              onClick={() => removePromotion(promoActiveInfo.id)}
              className="btn btn-small"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                fontSize: '0.78rem',
                padding: '5px 10px'
              }}
            >
              Retirer
            </button>
          </div>
        </div>
      )}

      {/* Lignes de prestations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
        {lignes.map((ligne, index) => {
          const isBillard = ligne.isBillard || ligne.categorieService === 'loisirs' || (ligne.serviceNom || '').toLowerCase().includes('billard');
          const matchedSvc = services.find(s => s.id === ligne.serviceId);
          const isBoisson = !isBillard && (ligne.isBoisson || ligne.categorieService === 'boisson' || ligne.categorieFilter === 'boisson' || matchedSvc?.categorie === 'boisson');
          const isPromoItem = !!(ligne.isPromo || ligne.promotionNom);
          const activeCatFilter = ligne.categorieFilter || (isBillard ? 'loisirs' : isBoisson ? 'boisson' : ligne.isDomicile ? 'domicile' : 'toutes');

          const salonServices = (services || []).filter(s => (s.categorie || 'salon') === 'salon');
          const boissonServices = (services || []).filter(s => s.categorie === 'boisson');
          const loisirsServices = (services || []).filter(s => s.categorie === 'loisirs');

          return (
            <div
              key={index}
              style={{
                border: isBillard
                  ? '1.5px solid var(--accent)'
                  : isBoisson
                    ? '1.5px solid rgba(236, 72, 153, 0.45)'
                    : isPromoItem
                      ? '1.5px solid rgba(245, 158, 11, 0.4)'
                      : '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '16px',
                backgroundColor: 'var(--bg-card)',
                boxShadow: isBillard
                  ? '0 0 16px var(--accent-glow)'
                  : isBoisson
                    ? '0 0 14px rgba(236, 72, 153, 0.12)'
                    : isPromoItem
                      ? '0 0 12px rgba(245, 158, 11, 0.1)'
                      : 'none',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: '700', color: isPromoItem ? '#F59E0B' : isBoisson ? '#ec4899' : 'var(--accent)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isBillard ? '🎱 Loisirs / Billard' : isBoisson ? `🍹 Boisson / Cocktail ${index + 1}` : `✂️ Prestation ${index + 1}`}
                  </span>
                  {isPromoItem && (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#F59E0B',
                      padding: '2px 8px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Tag size={11} /> Promo: {ligne.promotionNom}
                    </span>
                  )}
                </div>

                {lignes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLigne(index)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                    title="Supprimer cette prestation"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* Ligne Billard personnalisée : nombre de parties, prix par partie (500 F), total & remise */}
              {isBillard ? (
                <div>
                  <div className="panier-billard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px', alignItems: 'flex-start' }}>
                    {/* 1. Catégorie */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Catégorie</label>
                      <select
                        className="input-control"
                        value="loisirs"
                        onChange={e => updateLigne(index, 'categorieFilter', e.target.value)}
                      >
                        <option value="toutes">📋 Toutes les catégories</option>
                        <option value="salon">✂️ Salon &amp; Esthétique</option>
                        <option value="boisson">🍹 Boissons &amp; Cocktails</option>
                        <option value="loisirs">🎱 Loisirs &amp; Jeux (Billard)</option>
                        <option value="domicile">🏠 À domicile</option>
                      </select>
                    </div>

                    {/* 2. Nombre de parties avec stepper - / + */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Nombre de parties</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => changeBillardParties(index, -1)}
                          className="btn"
                          style={{
                            padding: '0 10px',
                            height: '42px',
                            minWidth: '36px',
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            borderRadius: '8px'
                          }}
                          title="Retirer une partie"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          className="input-control"
                          style={{ margin: 0, textAlign: 'center', fontWeight: '800', fontSize: '1rem', flex: 1 }}
                          value={ligne.nombreParties ?? 1}
                          onChange={e => updateLigne(index, 'nombreParties', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => changeBillardParties(index, 1)}
                          className="btn"
                          style={{
                            padding: '0 10px',
                            height: '42px',
                            minWidth: '36px',
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            borderRadius: '8px'
                          }}
                          title="Ajouter une partie"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 3. Prix par partie (500 F par défaut) */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Prix / partie (FCFA)</label>
                      <input
                        type="number"
                        min="0"
                        className="input-control"
                        value={ligne.prixUnitaire ?? 500}
                        onChange={e => updateLigne(index, 'prixUnitaire', e.target.value)}
                        placeholder="500"
                      />
                    </div>

                    {/* 4. Total Billard */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Total Billard (FCFA)</label>
                      <input
                        type="number"
                        min="0"
                        className="input-control"
                        style={{ fontWeight: '800', color: 'var(--accent)', fontSize: '1.05rem' }}
                        value={ligne.prixFinal ?? 0}
                        onChange={e => updateLigne(index, 'prixFinal', e.target.value)}
                        placeholder="500"
                      />
                    </div>

                    {/* 5. Remise / Offert */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Remise</label>
                      <select
                        className="input-control"
                        value={ligne.remiseType || 'aucune'}
                        onChange={e => updateLigne(index, 'remiseType', e.target.value)}
                      >
                        <option value="aucune">Aucune remise</option>
                        <option value="pourcentage">Pourcentage (%)</option>
                        <option value="fixe">Montant fixe (FCFA)</option>
                        <option value="offert">Partie offerte (0 F)</option>
                      </select>
                    </div>

                    {ligne.remiseType && ligne.remiseType !== 'aucune' && ligne.remiseType !== 'offert' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Valeur remise</label>
                        <input
                          type="number"
                          className="input-control"
                          value={ligne.remiseValeur || ''}
                          onChange={e => updateLigne(index, 'remiseValeur', e.target.value)}
                          placeholder={ligne.remiseType === 'pourcentage' ? 'Ex: 20' : 'Ex: 500'}
                        />
                      </div>
                    )}
                  </div>

                  {/* Boutons rapides pour sélectionner 1, 2, 3, 4 parties en 1 clic */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Raccourcis :</span>
                    {[
                      { p: 1, label: '1 partie (500 F)' },
                      { p: 2, label: '2 parties (1 000 F)' },
                      { p: 3, label: '3 parties (1 500 F)' },
                      { p: 4, label: '4 parties (2 000 F)' },
                    ].map(preset => {
                      const isSel = (Number(ligne.nombreParties) || 1) === preset.p && (Number(ligne.prixUnitaire) || 500) === 500;
                      return (
                        <button
                          key={preset.p}
                          type="button"
                          onClick={() => setBillardPartiesPreset(index, preset.p)}
                          className="btn btn-small"
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 9px',
                            borderRadius: '8px',
                            backgroundColor: isSel ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-input)',
                            color: isSel ? 'var(--accent)' : 'var(--text-muted)',
                            border: isSel ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                            fontWeight: isSel ? 700 : 500
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Prestation classique, Boisson/Cocktail ou issue d'une promo */
                <div className="panier-ligne-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
                  {/* 1. Sélecteur de Catégorie */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>1. Catégorie</label>
                    <select
                      className="input-control"
                      value={activeCatFilter}
                      onChange={e => updateLigne(index, 'categorieFilter', e.target.value)}
                    >
                      <option value="toutes">📋 Toutes catégories</option>
                      <option value="salon">✂️ Salon &amp; Esthétique</option>
                      <option value="boisson">🍹 Boissons &amp; Cocktails</option>
                      <option value="loisirs">🎱 Loisirs &amp; Jeux</option>
                      <option value="domicile">🏠 À domicile</option>
                    </select>
                  </div>

                  {/* 2. Service ou Boisson */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>2. {isBoisson ? 'Boisson / Cocktail' : 'Service / Prestation'}</label>
                    <select
                      className="input-control"
                      value={ligne.isDomicile ? `dom_${ligne.serviceId}` : ligne.serviceId}
                      onChange={e => updateLigne(index, 'serviceId', e.target.value)}
                      required={!ligne.serviceNom}
                    >
                      <option value="">
                        {activeCatFilter === 'boisson'
                          ? (boissonServices.length > 0 ? 'Choisir une boisson / cocktail...' : 'Aucune boisson au menu (saisir ci-dessous ou ajouter dans Paramètres)')
                          : 'Choisir un service...'}
                      </option>

                      {(activeCatFilter === 'toutes' || activeCatFilter === 'boisson') && boissonServices.length > 0 && (
                        <optgroup label="🍹 Boissons & Cocktails">
                          {boissonServices.map(s => (
                            <option key={s.id} value={s.id}>🍹 {s.nom} — {Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA</option>
                          ))}
                        </optgroup>
                      )}

                      {(activeCatFilter === 'toutes' || activeCatFilter === 'salon') && salonServices.length > 0 && (
                        <optgroup label="✂️ Salon & Esthétique">
                          {salonServices.map(s => (
                            <option key={s.id} value={s.id}>{s.nom} — {Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA</option>
                          ))}
                        </optgroup>
                      )}

                      {(activeCatFilter === 'toutes' || activeCatFilter === 'loisirs') && (
                        <optgroup label="🎱 Loisirs & Jeux">
                          <option value="billard">🎱 Billard</option>
                          {loisirsServices.map(s => (
                            <option key={s.id} value={s.id}>🎱 {s.nom} — {Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA</option>
                          ))}
                        </optgroup>
                      )}

                      {(activeCatFilter === 'toutes' || activeCatFilter === 'domicile') && servicesDomicile && servicesDomicile.length > 0 && (
                        <optgroup label="🏠 À domicile">
                          {servicesDomicile.map(s => (
                            <option key={`dom_${s.id}`} value={`dom_${s.id}`}>{s.nom} — {Number(s.prixDefaut).toLocaleString('fr-FR')} FCFA</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Si Boisson et pas encore dans le menu ou saisie libre */}
                  {isBoisson && !ligne.serviceId && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Nom de la boisson (saisie libre)</label>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Ex: Cocktail Mojito..."
                        value={ligne.serviceNom || ''}
                        onChange={e => updateLigne(index, 'serviceNom', e.target.value)}
                      />
                    </div>
                  )}

                  {/* Prix */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>{isBoisson ? 'Prix de vente (FCFA)' : 'Prix (FCFA)'}</label>
                    <input
                      type="number"
                      min="0"
                      className="input-control"
                      value={ligne.prixFinal ?? ''}
                      onChange={e => updateLigne(index, 'prixFinal', e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  {/* Remise */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Remise</label>
                    <select
                      className="input-control"
                      value={ligne.remiseType || 'aucune'}
                      onChange={e => updateLigne(index, 'remiseType', e.target.value)}
                    >
                      <option value="aucune">Aucune remise</option>
                      <option value="pourcentage">Pourcentage (%)</option>
                      <option value="fixe">Montant fixe (FCFA)</option>
                      <option value="offert">Offert (0 FCFA)</option>
                    </select>
                  </div>

                  {/* Valeur remise */}
                  {ligne.remiseType && ligne.remiseType !== 'aucune' && ligne.remiseType !== 'offert' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Valeur remise</label>
                      <input
                        type="number"
                        className="input-control"
                        value={ligne.remiseValeur || ''}
                        onChange={e => updateLigne(index, 'remiseValeur', e.target.value)}
                        placeholder={ligne.remiseType === 'pourcentage' ? 'Ex: 20' : 'Ex: 1000'}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Motif remise (si applicable) */}
              {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                <div className="form-group" style={{ margin: '10px 0 0 0' }}>
                  <label>Motif de la remise / soin offert</label>
                  <input
                    type="text"
                    className="input-control"
                    value={ligne.remiseMotif || ''}
                    onChange={e => updateLigne(index, 'remiseMotif', e.target.value)}
                    placeholder="Ex: Soin offert, fidélité client, pack promotionnel..."
                    required
                  />
                </div>
              )}

              {/* Agents assignés */}
              {isBillard ? (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.22)',
                  borderRadius: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>🎱</span>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                          Partie autonome (Aucun agent requis)
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {(ligne.agents && ligne.agents.length > 0)
                            ? `Agent sélectionné : ${ligne.agents.map(a => a.nom).join(', ')}`
                            : 'Enregistrement direct sans assignation de personnel.'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {ligne.agents && ligne.agents.length > 0 && (
                        <button
                          type="button"
                          onClick={() => clearLineAgents(index)}
                          className="btn btn-small"
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--danger)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            cursor: 'pointer'
                          }}
                          title="Repasser en partie autonome sans agent"
                        >
                          ✕ Retirer l'agent
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleBillardAgentPicker(index)}
                        className="btn btn-small"
                        style={{
                          fontSize: '0.74rem',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          backgroundColor: (ligne.agents && ligne.agents.length > 0) ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-input)',
                          color: (ligne.agents && ligne.agents.length > 0) ? 'var(--accent)' : 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}
                      >
                        {showBillardAgentsMap[index]
                          ? 'Masquer les agents'
                          : ((ligne.agents && ligne.agents.length > 0) ? 'Modifier l’agent' : '+ Assigner un agent (Optionnel)')}
                      </button>
                    </div>
                  </div>

                  {(showBillardAgentsMap[index] || (ligne.agents && ligne.agents.length > 0)) && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(16, 185, 129, 0.25)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        <Users size={13} />
                        Sélectionner l'agent (Optionnel) :
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {employes.map(emp => {
                          const safeAgents = ligne.agents || [];
                          const isSelected = safeAgents.some(a => a.id === emp.id);
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => toggleAgent(index, emp)}
                              className={`agent-badge ${isSelected ? 'selected' : ''}`}
                              style={{ fontSize: '0.76rem', padding: '3px 8px' }}
                            >
                              {emp.nom}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: isBoisson ? '#ec4899' : 'var(--text-muted)', fontWeight: isBoisson ? 700 : 500, marginBottom: '8px' }}>
                    <Users size={14} />
                    {isBoisson
                      ? '🍹 Préparé / Servi par (Employé ayant préparé la boisson)'
                      : 'Agents assignés à cette prestation'}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {employes.map(emp => {
                      const safeAgents = ligne.agents || [];
                      const isSelected = safeAgents.some(a => a.id === emp.id);
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => toggleAgent(index, emp)}
                          className={`agent-badge ${isSelected ? 'selected' : ''}`}
                        >
                          {emp.nom}
                        </button>
                      );
                    })}
                  </div>
                  {(!ligne.agents || ligne.agents.length === 0) && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '4px 0 0 0' }}>
                      {isBoisson ? "Veuillez sélectionner l'employé qui a préparé / servi cette boisson." : "Veuillez assigner au moins un agent."}
                    </p>
                  )}
                </div>
              )}

              {/* Prix final calculé si remise */}
              {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Prix base : <span style={{ textDecoration: 'line-through' }}>{ligne.prixBase} FCFA</span>
                  {' → '}
                  <span style={{ fontWeight: 'bold', color: isPromoItem ? '#F59E0B' : 'var(--accent)' }}>
                    {Number(ligne.prixFinal || 0).toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bouton ajouter prestation bas */}
      <button
        type="button"
        onClick={() => addLigne('toutes')}
        className="btn-add-prestation"
      >
        <PlusCircle size={16} /> Ajouter une autre prestation ou boisson
      </button>

      {/* Mode de paiement + Total */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {!hidePayment && (
          <div className="form-group" style={{ flex: 1, minWidth: '160px', margin: 0 }}>
            <label>Mode de paiement</label>
            <select className="input-control" value={modePaiement || 'Cash'} onChange={e => setModePaiement && setModePaiement(e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="NITA">NITA</option>
              <option value="AMANA">AMANA</option>
              <option value="Carte VISA">Carte VISA</option>
            </select>
          </div>
        )}

        <div style={{
          flex: 2,
          backgroundColor: 'var(--accent-subtle)',
          border: '2px solid var(--accent)',
          borderRadius: '14px',
          padding: '12px 20px',
          textAlign: 'right',
          minWidth: '180px'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            TOTAL A ENCAISSER
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            {totalGeneral.toLocaleString('fr-FR')} FCFA
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {lignes.length} prestation(s)
          </div>
        </div>
      </div>

      {/* ── MODAL SÉLECTEUR DE PROMOTIONS ─────────────────────────────────── */}
      {showPromoModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPromoModal(false)}
          style={{ zIndex: 1200 }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '640px', width: '95%', maxHeight: '88vh', overflowY: 'auto' }}
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
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                    Promotions & Packs Disponibles
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Sélectionnez une offre pour charger automatiquement tous ses soins au tarif promotionnel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="btn-icon"
              >
                <X size={20} />
              </button>
            </div>

            {promotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Tag size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                <p>Aucune promotion active actuellement.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {promotions.map(promo => {
                  const soins = promo.servicesInclus || [];
                  return (
                    <div
                      key={promo.id}
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: '14px',
                        padding: '16px',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                              {promo.nom}
                            </h4>
                            {promo.economiePourcentage > 0 && (
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                color: '#F59E0B',
                                padding: '2px 8px',
                                borderRadius: '10px'
                              }}>
                                -{promo.economiePourcentage}%
                              </span>
                            )}
                          </div>
                          {promo.description && (
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {promo.description}
                            </p>
                          )}
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--success)' }}>
                            {Number(promo.prixTotalPromo || 0).toLocaleString('fr-FR')} F
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                            {Number(promo.prixTotalStandard || 0).toLocaleString('fr-FR')} F
                          </div>
                        </div>
                      </div>

                      {/* Liste des soins inclus */}
                      <div style={{
                        backgroundColor: 'var(--bg-main)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        {soins.map((s, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>• {s.serviceNom}</span>
                            <span>
                              <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through', marginRight: '6px', fontSize: '0.75rem' }}>
                                {Number(s.prixStandard).toLocaleString('fr-FR')} F
                              </span>
                              <strong style={{ color: 'var(--success)' }}>{Number(s.prixPromo).toLocaleString('fr-FR')} F</strong>
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F59E0B' }}>
                          Économie totale : -{Number(promo.economie || 0).toLocaleString('fr-FR')} FCFA
                        </span>

                        <button
                          type="button"
                          onClick={() => applyPromotion(promo)}
                          className="btn btn-primary"
                          style={{
                            padding: '8px 16px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <ShoppingBag size={14} /> Appliquer ce pack
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PanierPrestations;
