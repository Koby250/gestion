import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, Edit2, Trash2, CheckCircle, X, AlertTriangle, MinusCircle, PackageOpen, Search } from 'lucide-react';
import SuccessModal from './SuccessModal';

const Inventaire = ({ currentUserNom = '' }) => {
  const [inventaire, setInventaire] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [newInventaire, setNewInventaire] = useState({ nom: '', reference: '', quantite: '', seuilAlerte: '', categorie: 'Général', prixAchat: '' });
  const [editingInventaireId, setEditingInventaireId] = useState(null);
  const [editInventaireForm, setEditInventaireForm] = useState({ nom: '', reference: '', quantite: '', seuilAlerte: '', categorie: 'Général', prixAchat: '' });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategorie, setSelectedCategorie] = useState('Toutes');
  
  const categoriesDisponibles = ['Toutes', 'Coiffure', 'Soins Visage', 'Pédicure', 'Manucure', 'Général'];
  const categoriesSaisie = ['Coiffure', 'Soins Visage', 'Pédicure', 'Manucure', 'Général'];

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
      reference: newInventaire.reference || '',
      categorie: newInventaire.categorie || 'Général',
      quantite: Number(newInventaire.quantite) || 0,
      seuilAlerte: Number(newInventaire.seuilAlerte) || 3,
      prixAchat: Number(newInventaire.prixAchat) || 0,
      actif: true,
      derniereActionPar: currentUserNom
    });
    setNewInventaire({ nom: '', reference: '', quantite: '', seuilAlerte: '', categorie: 'Général', prixAchat: '' });
    setShowSuccess(true);
  };

  const startEditInventaire = (inv) => {
    setEditingInventaireId(inv.id);
    setEditInventaireForm({ 
      nom: inv.nom, 
      reference: inv.reference || '', 
      quantite: inv.quantite.toString(), 
      seuilAlerte: inv.seuilAlerte.toString(), 
      categorie: inv.categorie || 'Général',
      prixAchat: inv.prixAchat != null ? inv.prixAchat.toString() : ''
    });
  };

  const saveEditInventaire = async (id) => {
    await updateDoc(doc(db, 'inventaire', id), {
      nom: editInventaireForm.nom,
      reference: editInventaireForm.reference || '',
      categorie: editInventaireForm.categorie || 'Général',
      quantite: Number(editInventaireForm.quantite) || 0,
      seuilAlerte: Number(editInventaireForm.seuilAlerte) || 3,
      prixAchat: Number(editInventaireForm.prixAchat) || 0
    });
    setEditingInventaireId(null);
    setShowSuccess(true);
  };

  const consumeInventaire = async (inv) => {
    if (inv.quantite > 0) {
      if (window.confirm(`Voulez-vous retirer 1 unité de "${inv.nom}" ?`)) {
        await updateDoc(doc(db, 'inventaire', inv.id), { quantite: inv.quantite - 1 });
        setShowSuccess(true);
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Voulez-vous vraiment supprimer cet article ?')) {
      await deleteDoc(doc(db, 'inventaire', id));
    }
  };

  return (
    <div className="view-container">
      {showSuccess && <SuccessModal message="Inventaire mis à jour avec succès" onClose={() => setShowSuccess(false)} />}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <PackageOpen size={24} color="var(--accent-color)" />
          <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Stock et Inventaire</h2>
        </div>

        <form onSubmit={handleAddInventaire} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '30px' }}>
          <input type="text" className="input-control" placeholder="Nom du produit" value={newInventaire.nom} onChange={e => setNewInventaire({...newInventaire, nom: e.target.value})} required />
          <input type="text" className="input-control" placeholder="Référence (optionnel)" value={newInventaire.reference} onChange={e => setNewInventaire({...newInventaire, reference: e.target.value})} />
          <select className="input-control" value={newInventaire.categorie} onChange={e => setNewInventaire({...newInventaire, categorie: e.target.value})}>
            {categoriesSaisie.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" className="input-control" placeholder="Quantité" value={newInventaire.quantite} onChange={e => setNewInventaire({...newInventaire, quantite: e.target.value})} min="0" required />
          <input type="number" className="input-control" placeholder="Seuil d'alerte" value={newInventaire.seuilAlerte} onChange={e => setNewInventaire({...newInventaire, seuilAlerte: e.target.value})} min="0" required />
          <input type="number" className="input-control" placeholder="Prix d'achat unitaire (FCFA)" value={newInventaire.prixAchat} onChange={e => setNewInventaire({...newInventaire, prixAchat: e.target.value})} min="0" />
          <button type="submit" className="btn btn-primary" style={{ gridColumn: '1 / -1' }}><Plus size={18} /> Ajouter un article</button>
        </form>

        <div className="list-container">
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
              <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '15px' }} />
              <input 
                type="text" 
                className="input-control" 
                style={{ paddingLeft: '40px', width: '100%', minHeight: '48px', margin: 0 }}
                placeholder="Rechercher par nom ou référence..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
            <select className="input-control" style={{ minWidth: '200px', margin: 0 }} value={selectedCategorie} onChange={e => setSelectedCategorie(e.target.value)}>
               {categoriesDisponibles.map(c => <option key={c} value={c}>{c === 'Toutes' ? 'Toutes les catégories' : c}</option>)}
            </select>
          </div>

          {inventaire.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', textAlign: 'center', padding: '40px 0' }}>Aucun article dans l'inventaire.</p>
          )}
          {inventaire.filter(inv => {
             const matchSearch = inv.nom.toLowerCase().includes(searchTerm.toLowerCase()) || (inv.reference && inv.reference.toLowerCase().includes(searchTerm.toLowerCase()));
             const matchCat = selectedCategorie === 'Toutes' || inv.categorie === selectedCategorie;
             return matchSearch && matchCat;
          }).map(inv => {
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
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ margin: 0, flex: 2, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Nom du produit</label>
                        <input type="text" className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.nom} onChange={e => setEditInventaireForm({...editInventaireForm, nom: e.target.value})} />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Référence</label>
                        <input type="text" className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.reference} onChange={e => setEditInventaireForm({...editInventaireForm, reference: e.target.value})} />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Catégorie</label>
                        <select className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.categorie} onChange={e => setEditInventaireForm({...editInventaireForm, categorie: e.target.value})}>
                          {categoriesSaisie.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Quantité</label>
                        <input type="number" className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.quantite} onChange={e => setEditInventaireForm({...editInventaireForm, quantite: e.target.value})} min="0" />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Seuil d'alerte</label>
                        <input type="number" className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.seuilAlerte} onChange={e => setEditInventaireForm({...editInventaireForm, seuilAlerte: e.target.value})} min="0" />
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: 1 }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Prix d'achat unitaire (FCFA)</label>
                        <input type="number" className="input-control" style={{ width: '100%', margin: 0 }} value={editInventaireForm.prixAchat} onChange={e => setEditInventaireForm({...editInventaireForm, prixAchat: e.target.value})} min="0" placeholder="0" />
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {isLow && <AlertTriangle size={18} color="var(--danger)" />}
                        <span style={{ fontWeight: '800', fontSize: '1.1rem', color: isLow ? 'var(--danger)' : 'var(--text-main)' }}>{inv.nom}</span>
                        {inv.reference && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>Réf: {inv.reference}</span>}
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-color)', border: '1px solid var(--accent-color)', padding: '2px 8px', borderRadius: '12px' }}>
                          {inv.categorie || 'Général'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        <span style={{ color: isLow ? 'var(--danger)' : 'var(--success)', fontWeight: '700' }}>{inv.quantite} unité(s) en stock</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>— Seuil d'alerte : {inv.seuilAlerte}</span>
                        {inv.prixAchat > 0 && (
                          <span style={{
                            marginLeft: '10px', fontSize: '0.82rem', fontWeight: '700',
                            color: 'var(--accent-color)',
                            backgroundColor: 'rgba(37,99,235,0.08)',
                            padding: '2px 8px', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.15)'
                          }}>
                            {inv.prixAchat.toLocaleString('fr-FR')} FCFA/unité
                            {inv.quantite > 0 && (
                              <span style={{ color: 'var(--text-muted)', fontWeight: '500', marginLeft: '4px' }}>
                                · Stock : {(inv.prixAchat * inv.quantite).toLocaleString('fr-FR')} F
                              </span>
                            )}
                          </span>
                        )}
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
