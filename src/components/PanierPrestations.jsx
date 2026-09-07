
import { PlusCircle, Trash2, Users } from 'lucide-react';

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
}) => {

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
        <div className="form-group" style={{ marginBottom: '15px' }}>
          <label>Nom du client (Optionnel)</label>
          <input
            type="text"
            className="input-control"
            placeholder="Ex: Amadou, Client anonyme..."
            value={clientNom}
            onChange={e => setClientNom(e.target.value)}
          />
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
