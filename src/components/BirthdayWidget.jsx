import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Cake, Phone, MessageCircle, X, ChevronDown } from 'lucide-react';

const cleanPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  if (cleaned.startsWith('0')) {
    // Assuming format from CI (+225)
    cleaned = '225' + cleaned.substring(1);
  }
  return cleaned;
};

const BirthdayWidget = () => {
  const [clients, setClients] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'clients'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(data);
    });
    return () => unsub();
  }, []);

  const { todayBirthdays, tomorrowBirthdays } = useMemo(() => {
    const today = new Date();
    const todayM = today.getMonth() + 1;
    const todayD = today.getDate();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomM = tomorrow.getMonth() + 1;
    const tomD = tomorrow.getDate();

    const todayB = [];
    const tomB = [];

    clients.forEach(c => {
      if (!c.birthDate) return;
      
      let m = null, d = null;
      if (c.birthDate.includes('/')) {
        const parts = c.birthDate.split('/');
        if (parts.length >= 2) { d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); }
      } else if (c.birthDate.includes('-')) {
        const parts = c.birthDate.split('-');
        if (parts.length === 3) {
          m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
        } else if (parts.length === 2) {
          d = parseInt(parts[0], 10); m = parseInt(parts[1], 10);
        }
      }

      if (m && d) {
        if (m === todayM && d === todayD) todayB.push(c);
        else if (m === tomM && d === tomD) tomB.push(c);
      }
    });

    return { todayBirthdays: todayB, tomorrowBirthdays: tomB };
  }, [clients]);

  const totalBirthdays = todayBirthdays.length + tomorrowBirthdays.length;

  if (totalBirthdays === 0 || isDismissed) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
    }}>
      <style>{`
        @keyframes birthdayBounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-12px); }
          60% { transform: translateY(-6px); }
        }
      `}</style>
      
      {/* BOUTON BULLE */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          style={{
            backgroundColor: '#ec4899', color: '#fff', border: 'none',
            borderRadius: '30px', padding: '12px 20px',
            boxShadow: '0 4px 12px rgba(236,72,153,0.4)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
            fontWeight: '700', fontSize: '0.95rem',
            animation: 'birthdayBounce 3s infinite',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Cake size={20} /> 
          {totalBirthdays} Anniversaire{totalBirthdays > 1 ? 's' : ''} à venir !
        </button>
      )}

      {/* PANNEAU OUVERT */}
      {isOpen && (
        <div style={{
          backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
          borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          width: '320px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          maxHeight: '70vh'
        }}>
          <div style={{
            backgroundColor: '#ec4899', color: '#fff', padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
              <Cake size={18} /> Anniversaires
            </h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }} title="Réduire"><ChevronDown size={20} /></button>
              <button onClick={() => setIsDismissed(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }} title="Fermer"><X size={20} /></button>
            </div>
          </div>

          <div style={{ padding: '12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {todayBirthdays.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Aujourd'hui</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {todayBirthdays.map(c => (
                    <div key={c.id} style={{ backgroundColor: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>{c.prenom} {c.nom}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{c.telephone}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                         <a href={`tel:${c.telephone}`} className="btn btn-small" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '6px', border: '1px solid var(--border-color)', color: 'var(--text-main)', textDecoration: 'none', fontSize: '0.75rem', backgroundColor: 'transparent' }}><Phone size={12}/> Appeler</a>
                         <a href={`https://wa.me/${cleanPhoneForWhatsApp(c.telephone)}?text=${encodeURIComponent(`Joyeux anniversaire ${c.prenom || c.nom} ! 🎂 L'équipe vous souhaite une excellente journée ! N'hésitez pas à passer au salon pour fêter ça !`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-small" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '6px', backgroundColor: '#25D366', color: '#fff', border: 'none', textDecoration: 'none', fontSize: '0.75rem' }}><MessageCircle size={12}/> WhatsApp</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tomorrowBirthdays.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Demain</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tomorrowBirthdays.map(c => (
                    <div key={c.id} style={{ backgroundColor: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>{c.prenom} {c.nom}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{c.telephone}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                         <a href={`tel:${c.telephone}`} className="btn btn-small" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '6px', border: '1px solid var(--border-color)', color: 'var(--text-main)', textDecoration: 'none', fontSize: '0.75rem', backgroundColor: 'transparent' }}><Phone size={12}/> Appeler</a>
                         <a href={`https://wa.me/${cleanPhoneForWhatsApp(c.telephone)}?text=${encodeURIComponent(`Bonjour ${c.prenom || c.nom} ! Sauf erreur, c'est votre anniversaire demain ! 🎂 L'équipe vous souhaite tout le meilleur par avance !`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-small" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '6px', backgroundColor: '#25D366', color: '#fff', border: 'none', textDecoration: 'none', fontSize: '0.75rem' }}><MessageCircle size={12}/> WhatsApp</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default BirthdayWidget;
