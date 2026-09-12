import { useState, useRef, useEffect } from 'react';
import { PlusCircle, Trash2, Users, Search, UserPlus, X, CheckCircle } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * PanierPrestations — Panier multi-services avec multi-agents par ligne.
 *
 * Props:
 *  - lignes: Array<{ serviceId, serviceNom, prixBase, prixFinal, agents: [{id, nom}], remiseType, remiseValeur, remiseMotif }>
 *  - setLignes: setter
 *  - services: Array (liste des services Firestore)
 *  - employes: Array (liste des employés Firestore)
 *  - clientNom: string
 *  - setClientNom: setter
 *  - modePaiement: string
 *  - setModePaiement: setter
 *  - showClientField: bool (afficher ou non le champ Nom Client — false pour Réservations car le champ existe déjà)
 */
const PanierPrestations = ({
  lignes,
  setLignes,
  services,
  employes,
  clientNom,
  setClientNom,
  modePaiement,
  setModePaiement,
  showClientField = true,
  hidePayment = false,
  clients = [],
  clientId,
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
  }).slice(0, 5);

  const handleSelectClient = (c) => {
    const fullName = [c.prenom, c.nom].filter(Boolean).join(' ');
    setClientNom(fullName);
    if (setClientId) setClientId(c.id);
    setShowDropdown(false);
  };

  const handleSaveNewClient = async (e) => {
    e.preventDefault();
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
      setNewClientForm({ nom: '', prenom: '', telephone: '' });
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la création du client.");
    } finally {
      setIsSavingClient(false);
    }
  };

  const totalGeneral = lignes.reduce((acc, l) => acc + Number(l.prixFinal || 0), 0);

  const addLigne = () => {
    try {
      setLignes(prev => [...prev, {
        serviceId: '',
        serviceNom: '',
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
        updated[index] = { ...updated[index], [field]: value };

        // Auto-fill price when service changes
        if (field === 'serviceId') {
          const service = services.find(s => s.id === value);
          if (service) {
            updated[index].serviceNom = service.nom;
            updated[index].prixBase = service.prixDefaut;
            updated[index].prixFinal = service.prixDefaut;
            updated[index].remiseType = 'aucune';
            updated[index].remiseValeur = '';
          }
        }

        // Recalculate prixFinal when remise changes
        if (['remiseType', 'remiseValeur', 'prixBase'].includes(field)) {
          const ligne = updated[index];
          const base = Number(ligne.prixBase) || 0;

          if (field === 'remiseType' && value === 'offert') {
            updated[index].remiseValeur = '0';
            updated[index].remiseMotif = 'Soin Offert';
          }

          if (ligne.remiseType === 'offert') {
            updated[index].prixFinal = 0;
          } else if (ligne.remiseType === 'pourcentage') {
            const pct = Number(updated[index].remiseValeur) || 0;
            updated[index].prixFinal = Math.max(0, base - (base * pct / 100));
          } else if (ligne.remiseType === 'fixe') {
            const montantRemise = Number(updated[index].remiseValeur) || 0;
            updated[index].prixFinal = Math.max(0, base - montantRemise);
          } else {
            updated[index].prixFinal = base;
          }
        }

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
      {showClientField && (
        <div className="form-group" style={{ marginBottom: '15px', position: 'relative' }} ref={dropdownRef}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Nom du client (Optionnel)</span>
            <button 
              type="button" 
              onClick={() => setShowAddClientModal(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}
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
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
              zIndex: 10,
              marginTop: '4px',
              maxHeight: '200px', overflowY: 'auto'
            }}>
              {filteredClients.length > 0 ? (
                filteredClients.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => handleSelectClient(c)}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-input)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', flexShrink: 0 }}>
                      {(c.prenom ? c.prenom[0] : (c.nom || '?')[0]).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)' }}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</div>
                      {c.telephone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.telephone}</div>}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Aucun client trouvé pour "{clientNom}"</span>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => setShowAddClientModal(true)}>
                    Créer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Add Client */}
      {showAddClientModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><UserPlus size={18} color="var(--accent-color)" /> Nouveau Client</h3>
              <button type="button" onClick={() => setShowAddClientModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveNewClient} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prénom</label>
                <input type="text" className="input-control" value={newClientForm.prenom} onChange={e => setNewClientForm({...newClientForm, prenom: e.target.value})} placeholder="Ex: Idriss" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom</label>
                <input type="text" className="input-control" value={newClientForm.nom} onChange={e => setNewClientForm({...newClientForm, nom: e.target.value})} placeholder="Ex: Farouk" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input type="tel" className="input-control" value={newClientForm.telephone} onChange={e => setNewClientForm({...newClientForm, telephone: e.target.value})} placeholder="Ex: +225 07..." />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSavingClient} style={{ width: '100%', marginTop: '10px' }}>
                <CheckCircle size={18} /> {isSavingClient ? 'Création...' : 'Créer et Sélectionner'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lignes de prestations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
        {lignes.map((ligne, index) => (
          <div
            key={index}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '15px',
              backgroundColor: 'var(--bg-input)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: '600', color: 'var(--accent-color)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Prestation {index + 1}
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              {/* Service */}
              <div className="form-group" style={{ margin: 0 }}>
                <label>Service</label>
                <select
                  className="input-control"
                  value={ligne.serviceId}
                  onChange={e => updateLigne(index, 'serviceId', e.target.value)}
                  required
                >
                  <option value="">Choisir un service</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.nom} — {s.prixDefaut} FCFA</option>
                  ))}
                </select>
              </div>

              {/* Prix */}
              <div className="form-group" style={{ margin: 0 }}>
                <label>Prix (FCFA)</label>
                <input
                  type="number"
                  className="input-control"
                  value={ligne.prixFinal}
                  onChange={e => {
                    updateLigne(index, 'prixBase', e.target.value);
                    updateLigne(index, 'prixFinal', e.target.value);
                  }}
                  placeholder="0"
                />
              </div>

              {/* Remise */}
              <div className="form-group" style={{ margin: 0 }}>
                <label>Remise</label>
                <select
                  className="input-control"
                  value={ligne.remiseType}
                  onChange={e => updateLigne(index, 'remiseType', e.target.value)}
                >
                  <option value="aucune">Aucune remise</option>
                  <option value="pourcentage">Pourcentage (%)</option>
                  <option value="fixe">Montant fixe (FCFA)</option>
                  <option value="offert">Offert</option>
                </select>
              </div>

              {/* Valeur remise */}
              {ligne.remiseType !== 'aucune' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Valeur remise</label>
                  <input
                    type="number"
                    className="input-control"
                    value={ligne.remiseValeur}
                    onChange={e => updateLigne(index, 'remiseValeur', e.target.value)}
                    placeholder={ligne.remiseType === 'pourcentage' ? 'Ex: 20' : 'Ex: 1000'}
                    disabled={ligne.remiseType === 'offert'}
                  />
                </div>
              )}
            </div>

            {/* Motif remise */}
            {ligne.remiseType !== 'aucune' && (
              <div className="form-group" style={{ margin: '10px 0 0 0' }}>
                <label>Motif de la remise (Obligatoire)</label>
                <input
                  type="text"
                  className="input-control"
                  value={ligne.remiseMotif}
                  onChange={e => updateLigne(index, 'remiseMotif', e.target.value)}
                  placeholder="Ex: Fidélité client, promotion semaine..."
                  required
                />
              </div>
            )}

            {/* Agents */}
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                <Users size={14} /> Agents assignés à cette prestation
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
                  Veuillez assigner au moins un agent.
                </p>
              )}
            </div>

            {/* Prix final calculé */}
            {ligne.remiseType !== 'aucune' && (
              <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Prix original : <span style={{ textDecoration: 'line-through' }}>{ligne.prixBase} FCFA</span>
                {' → '}
                <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{Number(ligne.prixFinal).toLocaleString('fr-FR')} FCFA</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bouton ajouter prestation */}
      <button
        type="button"
        onClick={addLigne}
        className="btn-add-prestation"
      >
        <PlusCircle size={16} /> Ajouter une prestation
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
          backgroundColor: 'rgba(37,99,235,0.08)',
          border: '2px solid var(--accent-color)',
          borderRadius: '12px',
          padding: '12px 20px',
          textAlign: 'right',
          minWidth: '180px'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            TOTAL A ENCAISSER
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--accent-color)', letterSpacing: '-0.02em' }}>
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
