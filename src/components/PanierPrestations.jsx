import { useState, useRef, useEffect } from 'react';
import { PlusCircle, Trash2, Users, Search, UserPlus, X, CheckCircle, Disc } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * PanierPrestations — Panier multi-services avec gestion du Billard sans agent,
 * création de client sans conflit de formulaires, et prise en charge des soins offerts (prix = 0).
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
  clientId = '',
  setClientId,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ nom: '', prenom: '', telephone: '' });
  const [isSavingClient, setIsSavingClient] = useState(false);
  const dropdownRef = useRef(null);

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

  const addLigne = () => {
    try {
      setLignes(prev => [...prev, {
        serviceId: '',
        serviceNom: '',
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

  const addBillardLigne = () => {
    try {
      setLignes(prev => [...prev, {
        serviceId: 'billard',
        serviceNom: 'Billard',
        isBillard: true,
        nombreParties: 1,
        prixUnitaire: 1000,
        prixBase: 1000,
        prixFinal: 1000,
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
      setLignes(prev => prev.filter((_, i) => i !== index));
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

        // Changement de service
        if (field === 'serviceId') {
          if (value === 'billard' || value === 'service_billard') {
            current.serviceId = 'billard';
            current.serviceNom = 'Billard';
            current.isBillard = true;
            current.nombreParties = current.nombreParties || 1;
            current.prixUnitaire = current.prixUnitaire ?? 1000;
            current.prixBase = (current.nombreParties || 1) * current.prixUnitaire;
            current.prixFinal = current.prixBase;
            current.remiseType = 'aucune';
            current.remiseValeur = '';
            current.agents = current.agents || [];
            updated[index] = current;
            return updated;
          }

          const isDomicile = value.startsWith('dom_');
          const realId = isDomicile ? value.replace('dom_', '') : value;
          const service = isDomicile ? (servicesDomicile || []).find(s => s.id === realId) : services.find(s => s.id === realId);
          if (service) {
            const isBillard = (service.nom || '').toLowerCase().includes('billard');
            current.serviceId = realId;
            current.serviceNom = service.nom;
            current.isBillard = isBillard;
            if (isBillard) {
              current.nombreParties = current.nombreParties || 1;
              current.prixUnitaire = Number(service.prixDefaut) || 1000;
              current.prixBase = current.nombreParties * current.prixUnitaire;
              current.prixFinal = current.prixBase;
            } else {
              current.prixBase = service.prixDefaut;
              current.prixFinal = service.prixDefaut;
            }
            current.remiseType = 'aucune';
            current.remiseValeur = '';
            current.isDomicile = isDomicile;
          }
          updated[index] = current;
          return updated;
        }

        // Nombre de parties de billard
        if (field === 'nombreParties') {
          const parties = Math.max(1, parseInt(value, 10) || 1);
          current.nombreParties = parties;
          const uPrice = Number(current.prixUnitaire ?? 1000);
          current.prixUnitaire = uPrice;
          const totalCalc = parties * uPrice;
          current.prixBase = totalCalc;
          current.prixFinal = totalCalc;
          updated[index] = current;
          return updated;
        }

        // Prix par partie de billard
        if (field === 'prixUnitaire') {
          const uPrice = value === '' ? '' : Math.max(0, Number(value));
          current.prixUnitaire = uPrice;
          const parties = Number(current.nombreParties) || 1;
          const totalCalc = parties * (Number(uPrice) || 0);
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
                  {/* Option pour enregistrer comme nouveau client si nom n'est pas un match exact */}
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

      {/* Modal Add Client — AUCUN élément <form> imbriqué pour éviter les soumissions parasites */}
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

      {/* Barre d'action rapide pour prestations et Billard */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={addLigne}
          className="btn btn-small"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusCircle size={15} /> + Prestation classique
        </button>
        <button
          type="button"
          onClick={addBillardLigne}
          className="btn btn-small"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent)', border: '1px solid var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          🎱 + Ajouter Billard (Sans agent)
        </button>
      </div>

      {/* Lignes de prestations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
        {lignes.map((ligne, index) => {
          const isBillard = ligne.isBillard || (ligne.serviceNom || '').toLowerCase().includes('billard');

          return (
            <div
              key={index}
              style={{
                border: isBillard ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '16px',
                backgroundColor: 'var(--bg-card)',
                boxShadow: isBillard ? '0 0 16px var(--accent-glow)' : 'none',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: '700', color: 'var(--accent)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isBillard ? '🎱 Billard' : `Prestation ${index + 1}`}
                </span>
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

              {/* Ligne Billard personnalisée : nombre de parties, prix par partie, total modifiable */}
              {isBillard ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Nombre de parties</label>
                    <input
                      type="number"
                      min="1"
                      className="input-control"
                      value={ligne.nombreParties ?? 1}
                      onChange={e => updateLigne(index, 'nombreParties', e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Prix par partie (FCFA)</label>
                    <input
                      type="number"
                      min="0"
                      className="input-control"
                      value={ligne.prixUnitaire ?? 1000}
                      onChange={e => updateLigne(index, 'prixUnitaire', e.target.value)}
                      placeholder="1000"
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Total Billard (FCFA)</label>
                    <input
                      type="number"
                      min="0"
                      className="input-control"
                      style={{ fontWeight: '700', color: 'var(--accent)' }}
                      value={ligne.prixFinal ?? 0}
                      onChange={e => updateLigne(index, 'prixFinal', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              ) : (
                /* Prestation classique */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  {/* Service */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Service</label>
                    <select
                      className="input-control"
                      value={ligne.isDomicile ? `dom_${ligne.serviceId}` : ligne.serviceId}
                      onChange={e => updateLigne(index, 'serviceId', e.target.value)}
                      required
                    >
                      <option value="">Choisir un service</option>
                      <optgroup label="Loisirs & Jeux">
                        <option value="billard">🎱 Billard</option>
                      </optgroup>
                      {services && services.length > 0 && (
                        <optgroup label="Au salon">
                          {services.map(s => (
                            <option key={s.id} value={s.id}>{s.nom} — {s.prixDefaut} FCFA</option>
                          ))}
                        </optgroup>
                      )}
                      {servicesDomicile && servicesDomicile.length > 0 && (
                        <optgroup label="À domicile">
                          {servicesDomicile.map(s => (
                            <option key={`dom_${s.id}`} value={`dom_${s.id}`}>{s.nom} — {s.prixDefaut} FCFA</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Prix */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Prix (FCFA)</label>
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
                    placeholder="Ex: Soin offert, fidélité client..."
                    required
                  />
                </div>
              )}

              {/* Agents assignés */}
              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <Users size={14} /> {isBillard ? 'Agent (Optionnel pour le billard)' : 'Agents assignés à cette prestation'}
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
                {isBillard ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--success)', margin: '6px 0 0 0' }}>
                    🎱 Partie autonome : vous pouvez enregistrer le billard sans sélectionner d'agent.
                  </p>
                ) : (
                  (!ligne.agents || ligne.agents.length === 0) && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '4px 0 0 0' }}>
                      Veuillez assigner au moins un agent.
                    </p>
                  )
                )}
              </div>

              {/* Prix final calculé si remise */}
              {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Prix base : <span style={{ textDecoration: 'line-through' }}>{ligne.prixBase} FCFA</span>
                  {' → '}
                  <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{Number(ligne.prixFinal || 0).toLocaleString('fr-FR')} FCFA</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bouton ajouter prestation bas */}
      <button
        type="button"
        onClick={addLigne}
        className="btn-add-prestation"
      >
        <PlusCircle size={16} /> Ajouter une autre prestation
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
    </div>
  );
};

export default PanierPrestations;
