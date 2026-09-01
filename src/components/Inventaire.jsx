import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Edit2, Trash2, CheckCircle, X, AlertTriangle, MinusCircle, PackageOpen } from 'lucide-react';

const Inventaire = () => {
  const [inventaire, setInventaire] = useState([]);
  
  const [newInventaire, setNewInventaire] = useState({ nom: '', quantite: '', seuilAlerte: '' });
  const [editingInventaireId, setEditingInventaireId] = useState(null);
  const [editInventaireForm, setEditInventaireForm] = useState({ nom: '', quantite: '', seuilAlerte: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventaire'), (snapshot) => {
      setInventaire(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleAddInventaire = async (e) => {
    e.preventDefault();
    if (!newInventaire.nom || newInventaire.quantite === '' || newInventaire.seuilAlerte === '') return;
    await addDoc(collection(db, 'inventaire'), {
      nom: newInventaire.nom,
      quantite: Number(newInventaire.quantite) || 0,
      seuilAlerte: Number(newInventaire.seuilAlerte) || 3,
      actif: true
    });
    setNewInventaire({ nom: '', quantite: '', seuilAlerte: '' });
  };

  const startEditInventaire = (inv) => {
    setEditingInventaireId(inv.id);
    setEditInventaireForm({ nom: inv.nom, quantite: inv.quantite.toString(), seuilAlerte: inv.seuilAlerte.toString() });
  };

  const saveEditInventaire = async (id) => {
    await updateDoc(doc(db, 'inventaire', id), {
      nom: editInventaireForm.nom,
      quantite: Number(editInventaireForm.quantite) || 0,
      seuilAlerte: Number(editInventaireForm.seuilAlerte) || 3
    });
    setEditingInventaireId(null);
  };

  const consumeInventaire = async (inv) => {
    if (inv.quantite > 0) {
      await updateDoc(doc(db, 'inventaire', inv.id), { quantite: inv.quantite - 1 });
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Voulez-vous vraiment supprimer cet article ?')) {
      await deleteDoc(doc(db, 'inventaire', id));
    }
  };

  return (
    <div className="view-container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <PackageOpen size={24} color="var(--accent-color)" />
          <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Stock et Inventaire</h2>
        </div>

        <form onSubmit={handleAddInventaire} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
          <input type="text" className="input-control" placeholder="Nom du produit (ex: Shampoing)" value={newInventaire.nom} onChange={e => setNewInventaire({...newInventaire, nom: e.target.value})} />
          <input type="number" className="input-control" placeholder="Quantite en stock" value={newInventaire.quantite} onChange={e => setNewInventaire({...newInventaire, quantite: e.target.value})} min="0" />
          <input type="number" className="input-control" placeholder="Seuil d'alerte" value={newInventaire.seuilAlerte} onChange={e => setNewInventaire({...newInventaire, seuilAlerte: e.target.value})} min="0" />
          <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}><Plus size={18} /> Ajouter un article</button>
        </form>

        <div className="list-container">
          {inventaire.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', textAlign: 'center', padding: '40px 0' }}>Aucun article dans l'inventaire.</p>
          )}
          {inventaire.map(inv => {
            const isLow = inv.quantite <= inv.seuilAlerte;
            return (
              <div key={inv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '15px 20px', borderBottom: '1px solid var(--border-color)',
                flexWrap: 'wrap', gap: '15px',
                backgroundColor: isLow ? 'rgba(239,68,68,0.05)' : 'var(--bg-input)',
                borderRadius: '12px',
                marginBottom: '10px'
              }}>
                {editingInventaireId === inv.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, width: '100%' }}>
                    <div className="form-group" style={{ margin: 0, width: '100%' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Nom du produit</label>
                      <input type="text" className="input-control" style={{ width: '100%' }} value={editInventaireForm.nom} onChange={e => setEditInventaireForm({...editInventaireForm, nom: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Quantite</label>
                        <input type="number" className="input-control" style={{ width: '100%' }} value={editInventaireForm.quantite} onChange={e => setEditInventaireForm({...editInventaireForm, quantite: e.target.value})} min="0" />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Seuil d'alerte</label>
                        <input type="number" className="input-control" style={{ width: '100%' }} value={editInventaireForm.seuilAlerte} onChange={e => setEditInventaireForm({...editInventaireForm, seuilAlerte: e.target.value})} min="0" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => saveEditInventaire(inv.id)} className="btn btn-success" style={{ flex: 1 }}><CheckCircle size={18} /> Enregistrer</button>
                      <button onClick={() => setEditingInventaireId(null)} className="btn" style={{ background: 'transparent', color: 'var(--text-main)', flex: 1, border: '1px solid var(--border-color)' }}><X size={18} /> Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        {isLow && <AlertTriangle size={18} color="var(--danger)" />}
                        <span style={{ fontWeight: '800', fontSize: '1.1rem', color: isLow ? 'var(--danger)' : 'var(--text-main)' }}>{inv.nom}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        <span style={{ color: isLow ? 'var(--danger)' : 'var(--success)', fontWeight: '700' }}>{inv.quantite} unite(s) en stock</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>— Seuil d'alerte : {inv.seuilAlerte}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        onClick={() => consumeInventaire(inv)}
                        className="btn"
                        disabled={inv.quantite === 0}
                        style={{ backgroundColor: inv.quantite === 0 ? 'transparent' : 'rgba(239,68,68,0.1)', color: inv.quantite === 0 ? 'var(--text-muted)' : 'var(--danger)', border: inv.quantite === 0 ? '1px solid var(--border-color)' : '1px solid rgba(239,68,68,0.25)', padding: '8px 16px' }}
                        title="Consommer 1 unite"
                      >
                        <MinusCircle size={16} style={{ marginRight: '6px' }} /> Utiliser 1 unite
                      </button>
                      <button onClick={() => startEditInventaire(inv)} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} title="Modifier">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(inv.id)} className="btn btn-danger" title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Inventaire;
