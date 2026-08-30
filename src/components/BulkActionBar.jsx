import React, { useState } from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { logEvent } from '../utils/audit';

const BulkActionBar = ({ selectedIds, collectionName, onClearSelection }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!selectedIds || selectedIds.length === 0) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const ref = doc(db, collectionName, id);
        batch.delete(ref);
      });
      await batch.commit();
      
      console.log(`[BulkDelete] ${selectedIds.length} éléments supprimés de ${collectionName}`);
      await logEvent('BULK_DELETE', `Suppression de ${selectedIds.length} éléments dans la collection ${collectionName}`);
      
      onClearSelection();
      setShowConfirm(false);
    } catch (err) {
      console.error('[BulkDelete] Erreur:', err);
      alert('Une erreur est survenue lors de la suppression groupée.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Barre d'action flottante */}
      <div style={{
        position: 'sticky',
        top: '20px',
        zIndex: 50,
        backgroundColor: 'var(--bg-card)',
        padding: '12px 20px',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        border: '1px solid var(--accent-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={onClearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="Désélectionner tout">
            <X size={18} />
          </button>
          <span style={{ fontWeight: '700', color: 'var(--accent-color)' }}>
            {selectedIds.length} élément{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}
          </span>
        </div>
        
        <button 
          onClick={() => setShowConfirm(true)}
          className="btn btn-danger"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          <Trash2 size={16} /> Supprimer la sélection
        </button>
      </div>

      {/* Modal de confirmation */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger)', marginBottom: '15px' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Confirmation de suppression</h3>
            </div>
            
            <p style={{ color: 'var(--text-main)', marginBottom: '20px' }}>
              Es-tu sûr de vouloir supprimer définitivement ces <strong>{selectedIds.length}</strong> éléments ? Cette action est irréversible.
            </p>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowConfirm(false)}
                className="btn"
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                disabled={isDeleting}
              >
                Annuler
              </button>
              <button 
                onClick={handleDelete}
                className="btn btn-danger"
                disabled={isDeleting}
              >
                {isDeleting ? 'Suppression...' : 'Oui, supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BulkActionBar;
