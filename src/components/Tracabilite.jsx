import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { History, Shield, Activity, Filter } from 'lucide-react';

const Tracabilite = () => {
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    // On récupère les 100 derniers logs pour éviter de surcharger
    const q = query(collection(db, 'logs_audit'), orderBy('date', 'desc'), limit(150));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const getActionColor = (action) => {
    if (action.includes('DELETE') || action.includes('CANCEL')) return 'var(--danger)';
    if (action.includes('CREATE') || action.includes('AJOUT')) return 'var(--success)';
    if (action.includes('UPDATE') || action.includes('MODIF')) return 'var(--accent-color)';
    return 'var(--text-main)';
  };

  const filteredLogs = filterAction === 'ALL' 
    ? logs 
    : logs.filter(l => l.action.includes(filterAction));

  return (
    <div className="view-container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={24} color="var(--accent-color)" />
            <h2 className="card-title" style={{ margin: 0, padding: 0, border: 'none' }}>Traçabilité & Sécurité</h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select 
              className="input-control" 
              value={filterAction} 
              onChange={e => setFilterAction(e.target.value)}
              style={{ minWidth: '180px', padding: '6px 10px' }}
            >
              <option value="ALL">Toutes les actions</option>
              <option value="RESERVATION">Réservations</option>
              <option value="TRANSACTION">Transactions (Caisse)</option>
              <option value="TRESORERIE">Trésorerie</option>
              <option value="PARAMETRE">Paramètres</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '12px 10px', width: '160px' }}>Date & Heure</th>
                <th style={{ padding: '12px 10px', width: '200px' }}>Admin</th>
                <th style={{ padding: '12px 10px', width: '220px' }}>Type d'Action</th>
                <th style={{ padding: '12px 10px' }}>Détails</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Aucun événement trouvé.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const d = new Date(log.date);
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                          {d.toLocaleDateString('fr-FR')}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {d.toLocaleTimeString('fr-FR')}
                        </div>
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: '500' }}>
                        {log.admin}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ 
                          padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700',
                          backgroundColor: 'var(--bg-input)',
                          color: getActionColor(log.action)
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', color: 'var(--text-muted)' }}>
                        {log.description}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Tracabilite;
