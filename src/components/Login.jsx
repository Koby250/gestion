import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Scissors, Mail, Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = ({ theme }) => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // La mise à jour de l'état se fait via onAuthStateChanged dans App.jsx
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

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
      }}>

        {/* Logo / Marque */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderRadius: '20px',
            padding: '18px',
            marginBottom: '16px',
            width: '72px',
            height: '72px'
          }}>
            <img 
              src={theme === 'dark' ? '/logos/blanc.png' : '/logos/noir.png'} 
              alt="Logo Barber Factory" 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
            />
          </div>
          <h1 style={{
            fontSize: '1.8rem',
            fontWeight: '800',
            color: 'var(--text-main)',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}>
            Barber Factory
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Connectez-vous à votre espace de gestion
          </p>
        </div>

        {/* Carte formulaire */}
        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleLogin}>

            {/* Message d'erreur */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: 'var(--danger)',
                fontSize: '0.9rem',
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} /> Adresse email
              </label>
              <input
                type="email"
                className="input-control"
                placeholder="admin@barbershop.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {/* Mot de passe */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} /> Mot de passe
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Bouton connexion */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px', fontSize: '1rem', padding: '14px' }}
              disabled={loading}
            >
              {loading
                ? 'Connexion en cours...'
                : <><LogIn size={18} /> Se connecter</>
              }
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Barber Factory &mdash; Accès réservé aux administrateurs
        </p>
      </div>
    </div>
  );
};

export default Login;
