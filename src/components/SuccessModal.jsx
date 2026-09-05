import { useEffect } from 'react';

const SuccessModal = ({ message, onClose, duration = 2500 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999,
      backdropFilter: 'blur(3px)',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes drawCheck {
          0% { stroke-dashoffset: 48; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>
      <div style={{
        backgroundColor: 'var(--bg-panel, #ffffff)',
        padding: '30px 40px', borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        maxWidth: '90%', width: '350px'
      }}>
        {/* Animated Checkmark SVG */}
        <div style={{
          width: '70px', height: '70px', borderRadius: '50%',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          marginBottom: '20px'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--success, #10b981)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{
              strokeDasharray: 48,
              strokeDashoffset: 48,
              animation: 'drawCheck 0.6s ease-out 0.2s forwards'
            }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--text-main)' }}>Opération Réussie</h3>
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
          {message || 'Enregistrement effectué avec succès.'}
        </p>
      </div>
    </div>
  );
};

export default SuccessModal;
