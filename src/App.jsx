import React, { useState, useEffect } from 'react';
import {
  Calculator, BarChart3, Settings, Scissors, Calendar, LogOut, User
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from './firebase';
import './index.css';
import Login       from './components/Login';
import Parametres  from './components/Parametres';
import Caisse      from './components/Caisse';
import Reservations from './components/Reservations';
import Bilan       from './components/Bilan';

function App() {
  const [activeTab,    setActiveTab]    = useState('caisse');
  const [dailyGoal,    setDailyGoal]    = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [user,         setUser]         = useState(null);  // utilisateur connecté
  const [authLoading,  setAuthLoading]  = useState(true);  // évite le flash Login avant check

  // ── Écoute l'état d'authentification ──────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Données dashboard (seulement si connecté) ─────────────────────────────
  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().objectifJournalier) {
        setDailyGoal(Number(docSnap.data().objectifJournalier));
      }
    });

    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubTransactions = onSnapshot(q, (snapshot) => {
      const now = new Date();
      let revenue = 0;
      snapshot.docs.forEach(docSnap => {
        const t = docSnap.data();
        const d = new Date(t.date);
        if (
          t.type === 'prestation' &&
          d.getDate()     === now.getDate() &&
          d.getMonth()    === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        ) {
          revenue += Number(t.montant);
        }
      });
      setTodayRevenue(revenue);
    });

    return () => {
      unsubSettings();
      unsubTransactions();
    };
  }, [user]);

  // ── Déconnexion ───────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    if (window.confirm('Voulez-vous vous déconnecter ?')) {
      await signOut(auth);
    }
  };

  // ── Écran de chargement (pendant la vérification Auth) ────────────────────
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Scissors size={36} color="var(--accent-color)" style={{ marginBottom: '12px' }} />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  // ── Si non connecté : afficher uniquement Login ───────────────────────────
  if (!user) return <Login />;

  // ── Rendu de la vue active ────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case 'caisse':      return <Caisse />;
      case 'bilan':       return <Bilan />;
      case 'reservations': return <Reservations />;
      case 'parametres':  return <Parametres />;
      default:            return <Caisse />;
    }
  };

  const progressPercentage = dailyGoal > 0 ? Math.min((todayRevenue / dailyGoal) * 100, 100) : 0;
  const todayStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <div className="app-container">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>
            <Scissors color="var(--accent-color)" />
            Barber Control
          </h1>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-btn ${activeTab === 'caisse' ? 'active' : ''}`}
            onClick={() => setActiveTab('caisse')}
          >
            <Calculator size={20} /> Caisse &amp; Journal
          </button>
          <button
            className={`nav-btn ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => setActiveTab('reservations')}
          >
            <Calendar size={20} /> Réservations
          </button>
          <button
            className={`nav-btn ${activeTab === 'bilan' ? 'active' : ''}`}
            onClick={() => setActiveTab('bilan')}
          >
            <BarChart3 size={20} /> Bilan Mensuel
          </button>
          <button
            className={`nav-btn ${activeTab === 'parametres' ? 'active' : ''}`}
            onClick={() => setActiveTab('parametres')}
          >
            <Settings size={20} /> Paramètres
          </button>
        </nav>

        {/* Profil + Déconnexion en bas de la sidebar */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              <User size={16} />
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-email" title={user.email}>
                {user.email}
              </span>
              <span className="sidebar-user-role">Administrateur</span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="btn-logout"
            title="Se déconnecter"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── MAIN WRAPPER ────────────────────────────────────────────────── */}
      <div className="main-wrapper">

        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-date">
            {todayStr.charAt(0).toUpperCase() + todayStr.slice(1)}
          </div>

          <div className="topbar-goal">
            <div className="goal-labels">
              <span>Objectif Journalier</span>
              <span>{todayRevenue.toLocaleString('fr-FR')} / {dailyGoal.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="goal-progress-bar">
              <div
                className="goal-progress-fill"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </header>

        <main className="main-content">
          {renderContent()}
        </main>
      </div>

    </div>
  );
}

export default App;
