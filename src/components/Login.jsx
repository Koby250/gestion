import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = ({ theme }) => {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPassword,setShowPassword]= useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('[Login] Erreur:', err.code);
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Email ou mot de passe incorrect. Vérifiez vos identifiants.');
          break;
        case 'auth/too-many-requests':
          setError('Trop de tentatives. Veuillez réessayer dans quelques minutes.');
          break;
        case 'auth/invalid-email':
          setError('Adresse email invalide.');
          break;
        default:
          setError('Une erreur est survenue. Vérifiez votre connexion internet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const logoSrc = theme === 'light' ? '/logos/noir.png' : '/logos/blanc.png';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Ambient glow background */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(212,168,83,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
        borderRadius: '50%',
      }} />

      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(212,168,83,0.15), rgba(212,168,83,0.04))',
            border: '1px solid rgba(212,168,83,0.25)',
            borderRadius: '22px',
            padding: '18px',
            marginBottom: '20px',
            width: '76px',
            height: '76px',
            boxShadow: '0 0 40px rgba(212,168,83,0.12), 0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <img
              src={logoSrc}
              alt="Logo Barber Factory"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <h1 style={{
            fontSize: '1.7rem',
            fontWeight: '800',
            color: 'var(--text-main)',
            marginBottom: '6px',
            letterSpacing: '-0.03em',
            fontFamily: 'Inter, sans-serif',
          }}>
            Barber Factory
          </h1>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.88rem',
            fontWeight: 400,
            letterSpacing: '0.01em',
          }}>
            Connectez-vous à votre espace de gestion
          </p>
        </div>

        {/* Login card */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '22px',
          padding: '32px 28px',
          border: '1px solid var(--border-gold)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.05)',
        }}>
          <form onSubmit={handleLogin}>

            {/* Error message */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(224, 85, 85, 0.08)',
                border: '1px solid rgba(224, 85, 85, 0.2)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: 'var(--danger)',
                fontSize: '0.85rem',
                lineHeight: '1.4',
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={12} style={{ opacity: 0.6 }} /> Adresse email
              </label>
              <input
                type="email"
                className="input-control"
                placeholder="admin@barberfactory.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={12} style={{ opacity: 0.6 }} /> Mot de passe
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'color 0.2s',
                  }}
                  title={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '10px', fontSize: '0.95rem', padding: '14px' }}
              disabled={loading}
            >
              {loading
                ? <span style={{ opacity: 0.8 }}>Connexion en cours...</span>
                : <><LogIn size={16} /> Se connecter</>
              }
            </button>

          </form>
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.03em',
        }}>
          Barber Factory &mdash; Accès réservé aux membres autorisés
        </p>
      </div>
    </div>
  );
};

export default Login;
