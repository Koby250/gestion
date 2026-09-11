import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Users, Plus, Search, Edit2, Trash2, X, CheckCircle,
  Phone, Calendar, TrendingUp, Star, Award, ChevronDown, ChevronUp, User
} from 'lucide-react';
import { logEvent } from '../utils/audit';

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const Clients = () => {
  const [clients, setClients]           = useState([]);
  const [reservations, setReservations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [sortBy, setSortBy]             = useState('nom');
  const [expandedId, setExpandedId]     = useState(null);

  // Form state
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [form, setForm]             = useState({ nom: '', telephone: '', notes: '' });
  const [isSaving, setIsSaving]     = useState(false);

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
    return clients.map(client => {
      const nom = (client.nom || '').toLowerCase().trim();

      // Réservations liées
      const clientRes = reservations.filter(r =>
        (r.clientNom || '').toLowerCase().trim() === nom
      );
      const encaissees = clientRes.filter(r =>
        r.statut === 'encaisse' || r.statut === 'paye_totalement'
      );

      // Transactions liées (prestations)
      const clientTx = transactions.filter(t =>
        t.type === 'prestation' &&
        (t.clientNom || '').toLowerCase().trim() === nom
      );

      const totalCA = clientTx.reduce((s, t) => s + Number(t.montant || 0), 0);
      const nbVisites = encaissees.length;
      const panierMoyen = nbVisites > 0 ? Math.round(totalCA / nbVisites) : 0;
      const derniereVisite = clientRes.length > 0
        ? clientRes.sort((a, b) => b.datePrevue.localeCompare(a.datePrevue))[0].datePrevue
        : null;

      // Calcul du score de fidélité
      let fidelite = 'Nouveau';
      let fideliteColor = 'var(--text-muted)';
      if (nbVisites >= 15) { fidelite = 'VIP'; fideliteColor = '#f59e0b'; }
      else if (nbVisites >= 8) { fidelite = 'Fidèle'; fideliteColor = '#8b5cf6'; }
      else if (nbVisites >= 3) { fidelite = 'Régulier'; fideliteColor = 'var(--accent-color)'; }

      return { ...client, totalCA, nbVisites, panierMoyen, derniereVisite, fidelite, fideliteColor };
    });
  }, [clients, reservations, transactions]);

  // ── Filtre & tri ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...enrichedClients];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.nom || '').toLowerCase().includes(s) ||
        (c.telephone || '').includes(s)
      );
    }
    if (sortBy === 'nom') list.sort((a, b) => a.nom.localeCompare(b.nom));
    if (sortBy === 'visites') list.sort((a, b) => b.nbVisites - a.nbVisites);
    if (sortBy === 'ca') list.sort((a, b) => b.totalCA - a.totalCA);
    if (sortBy === 'derniereVisite') list.sort((a, b) => (b.derniereVisite || '').localeCompare(a.derniereVisite || ''));
    return list;
  }, [enrichedClients, searchTerm, sortBy]);

  // ── KPIs globaux ─────────────────────────────────────────────────────────
  const totalCA      = enrichedClients.reduce((s, c) => s + c.totalCA, 0);
  const totalVisites = enrichedClients.reduce((s, c) => s + c.nbVisites, 0);
  const panierGlobal = totalVisites > 0 ? Math.round(totalCA / totalVisites) : 0;
  const nbVIP        = enrichedClients.filter(c => c.fidelite === 'VIP').length;

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const resetForm = () => { setForm({ nom: '', telephone: '', notes: '' }); setEditingId(null); };

  const handleOpenAdd = () => { resetForm(); setShowForm(true); };

  const handleEdit = (c) => {
    setForm({ nom: c.nom, telephone: c.telephone || '', notes: c.notes || '' });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'clients', editingId), {
          nom: form.nom.trim(), telephone: form.telephone.trim(), notes: form.notes.trim()
        });
        await logEvent('CLIENT_UPDATE', `Modification client : ${form.nom}`);
      } else {
        await addDoc(collection(db, 'clients'), {
          nom: form.nom.trim(), telephone: form.telephone.trim(), notes: form.notes.trim(),
          createdAt: new Date().toISOString()
        });
        await logEvent('CLIENT_CREATE', `Ajout client : ${form.nom}`);
      }
      resetForm(); setShowForm(false);
    } catch (err) {
      console.error('[Clients] Erreur:', err);
      alert('Une erreur est survenue.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Supprimer le client "${c.nom}" ? L'historique de ses réservations est conservé.`)) return;
    try {
      await deleteDoc(doc(db, 'clients', c.id));
      await logEvent('CLIENT_DELETE', `Suppression client : ${c.nom}`);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="view-container">
      {/* ── KPI STRIP ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Clients enregistrés', value: clients.length, icon: <Users size={20} />, color: 'var(--accent-color)' },
          { label: 'Visites totales', value: totalVisites, icon: <Calendar size={20} />, color: 'var(--success)' },
          { label: 'Panier moyen global', value: `${panierGlobal.toLocaleString('fr-FR')} F`, icon: <TrendingUp size={20} />, color: '#8b5cf6' },
          { label: 'Clients VIP (≥15 visites)', value: nbVIP, icon: <Star size={20} />, color: '#f59e0b' },
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
          <button className="btn btn-primary" onClick={handleOpenAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={18} /> Nouveau client
          </button>
        </div>

        {/* ── FILTRES ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '220px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" className="input-control"
              style={{ paddingLeft: '38px', width: '100%', margin: 0 }}
              placeholder="Rechercher par nom ou téléphone…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select className="input-control" style={{ flex: 1, minWidth: '170px', margin: 0 }}
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="nom">Trier : Nom (A→Z)</option>
            <option value="visites">Trier : Visites (↓)</option>
            <option value="ca">Trier : CA généré (↓)</option>
            <option value="derniereVisite">Trier : Dernière visite (↓)</option>
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
                border: '1px solid var(--border-color)', overflow: 'hidden',
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
                    fontWeight: '800', fontSize: '1.1rem', color: client.fideliteColor
                  }}>
                    {(client.nom || '?')[0].toUpperCase()}
                  </div>

                  {/* Infos */}
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-main)' }}>{client.nom}</span>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                        border: `1px solid ${client.fideliteColor}55`,
                        color: client.fideliteColor, backgroundColor: `${client.fideliteColor}11`
                      }}>
                        {client.fidelite === 'VIP' && <Award size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />}
                        {client.fidelite}
                      </span>
                    </div>
                    {client.telephone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                        <Phone size={12} /> {client.telephone}
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
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#8b5cf6' }}>{client.panierMoyen.toLocaleString('fr-FR')}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600' }}>Panier moy.</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button className="btn btn-small"
                      style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
                      onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                      title="Voir l'historique"
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

                {/* Historique déroulant */}
                {expandedId === client.id && (() => {
                  const nom = (client.nom || '').toLowerCase().trim();
                  const clientRes = reservations.filter(r =>
                    (r.clientNom || '').toLowerCase().trim() === nom
                  ).slice(0, 10);
                  return (
                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px 18px', backgroundColor: 'var(--bg-primary)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                        Derniers passages
                      </div>
                      {clientRes.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucun historique trouvé.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {clientRes.map(r => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', flexWrap: 'wrap', gap: '8px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{r.datePrevue}</span>
                              <span style={{ color: 'var(--text-main)', flex: 1, marginLeft: '12px' }}>{r.serviceNom || 'Prestation'}</span>
                              <span style={{ fontWeight: '700', color: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'var(--success)' : 'var(--text-muted)' }}>
                                {r.prixTotal?.toLocaleString('fr-FR')} F
                              </span>
                              <span style={{
                                fontSize: '0.7rem', padding: '2px 7px', borderRadius: '8px',
                                backgroundColor: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                                color: r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'var(--success)' : 'var(--danger)'
                              }}>
                                {r.statut === 'encaisse' || r.statut === 'paye_totalement' ? 'Payé' : r.statut?.replace('_', ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {client.notes && (
                        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#f59e0b' }}>📝 Notes :</span>
                          <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-main)' }}>{client.notes}</p>
                        </div>
                      )}
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
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '28px',
            width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="var(--accent-color)" />
                {editingId ? 'Modifier le client' : 'Nouveau client'}
              </h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom complet *</label>
                <input type="text" className="input-control" placeholder="Ex : Idriss Farouk"
                  value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Téléphone</label>
                <input type="tel" className="input-control" placeholder="Ex : +225 07 XX XX XX"
                  value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Notes internes</label>
                <textarea className="input-control" placeholder="Ex : Allergie au menthol, préférence rasoir droit…"
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', marginTop: '4px' }}>
                <CheckCircle size={18} /> {isSaving ? 'Enregistrement…' : (editingId ? 'Enregistrer les modifications' : 'Ajouter le client')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
