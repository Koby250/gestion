import { useState } from 'react';
import { Search, Play, CheckCircle, MessageSquare, X } from 'lucide-react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { logEvent } from '../utils/audit';

const RechercheExpress = ({ reservations = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showNotesId, setShowNotesId] = useState(null);
  
  if (!reservations) return null;

  // Filtrer les réservations dès le 1er caractère tapé
  const filtered = searchTerm.trim().length > 0
    ? reservations.filter(res => {
        const term = searchTerm.toLowerCase();
        const nom = (res.clientNom || '').toLowerCase();
        const tel = (res.clientTel || '').toLowerCase();
        const heure = (res.heurePrevue || '').toLowerCase();
        const employe = (res.employeNom || '').toLowerCase();
        return nom.includes(term) || tel.includes(term) || heure.includes(term) || employe.includes(term);
      }).slice(0, 5) // Limiter à 5 résultats pour la lisibilité
    : [];

  const handleDemarrer = async (res) => {
    try {
      await updateDoc(doc(db, 'reservations', res.id), { statut: 'en_cours' });
      await logEvent('RESERVATION_UPDATE', `Démarrage de la prestation pour ${res.clientNom}`);
    } catch (error) {
      console.error(error);
      alert('Erreur lors du démarrage.');
    }
  };

  const handleMarquerPayee = async (res) => {
    try {
      const resteAPayer = res.prixTotal - (res.acomptePaye || 0);
      
      if (resteAPayer > 0) {
        // Enregistrer en caisse par défaut en Cash si payé d'ici
        await addDoc(collection(db, 'transactions'), {
          type: 'prestation',
          montant: resteAPayer,
          motif: `Solde réservation (Express) - ${res.clientNom} (${res.serviceNom})`,
          employeId: res.employeId,
          employeNom: res.employeNom,
          modePaiement: 'Cash',
          date: new Date().toISOString()
        });
      }

      await updateDoc(doc(db, 'reservations', res.id), {
        statut: 'encaisse',
        acomptePaye: res.prixTotal
      });
      await logEvent('RESERVATION_UPDATE', `Encaissement express pour ${res.clientNom}`);
      
    } catch (error) {
      console.error(error);
      alert('Erreur lors de l\'encaissement express.');
    }
  };

  const isNonEncaisse = (statut) => statut !== 'encaisse' && statut !== 'paye_totalement';

  const formatStatut = (statut) => {
    switch (statut) {
      case 'encaisse': return { label: 'Payée', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' };
      case 'acompte_verse': return { label: 'Acompte versé', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' };
      case 'en_cours': return { label: 'En cours', color: 'var(--accent-color)', bg: 'rgba(37, 99, 235, 0.1)' };
      default: return { label: 'En attente', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.1)' };
    }
  };

  return (
    <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
      <div style={{ position: 'relative' }}>
        <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', top: '10px', left: '12px' }} />
        <input 
          type="text" 
          className="input-control" 
          placeholder="Recherche Express Réservation (Nom, Tel, Heure, Coiffeur)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ paddingLeft: '40px', fontSize: '1rem', height: '42px', width: '100%' }}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')} 
            style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(res => {
            const statusConfig = formatStatut(res.statut);
            const showNotes = showNotesId === res.id;
            
            return (
              <div key={res.id} style={{ 
                border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', 
                backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '8px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                      {res.clientNom} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{res.clientTel ? `— ${res.clientTel}` : ''}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '10px', marginTop: '4px' }}>
                      <span>{res.heurePrevue}</span>
                      <span>•</span>
                      <span>{res.serviceNom}</span>
                      <span>•</span>
                      <span>{res.employeNom}</span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                      backgroundColor: statusConfig.bg, color: statusConfig.color 
                    }}>
                      {statusConfig.label}
                    </span>
                  </div>
                </div>

                {showNotes && res.historiqueNotes && res.historiqueNotes.length > 0 && (
                  <div style={{ 
                    backgroundColor: 'rgba(37,99,235,0.06)', padding: '8px 12px', borderRadius: '8px', 
                    fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', border: '1px solid rgba(37,99,235,0.1)'
                  }}>
                    {res.historiqueNotes.map((note, idx) => (
                      <div key={idx} style={{ marginBottom: '4px' }}>
                        <strong>{new Date(note.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')} : </strong>
                        {note.texte}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {res.statut !== 'en_cours' && isNonEncaisse(res.statut) && (
                    <button onClick={() => handleDemarrer(res)} className="btn btn-small" style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}>
                      <Play size={14} style={{ marginRight: '4px' }} /> Démarrer la prestation
                    </button>
                  )}
                  {isNonEncaisse(res.statut) && (
                    <button onClick={() => handleMarquerPayee(res)} className="btn btn-small" style={{ backgroundColor: 'var(--success)', color: '#fff' }}>
                      <CheckCircle size={14} style={{ marginRight: '4px' }} /> Marquer payée
                    </button>
                  )}
                  {res.historiqueNotes && res.historiqueNotes.length > 0 && (
                    <button onClick={() => setShowNotesId(showNotes ? null : res.id)} className="btn btn-small" style={{ backgroundColor: 'var(--bg-input)' }}>
                      <MessageSquare size={14} style={{ marginRight: '4px' }} /> {showNotes ? 'Masquer notes' : 'Voir notes'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {searchTerm.trim() !== '' && filtered.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Aucune réservation trouvée pour "{searchTerm}".
        </div>
      )}
    </div>
  );
};

export default RechercheExpress;
