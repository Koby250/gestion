import React, { useState, useEffect } from 'react';
import {
  Calculator, BarChart3, Settings, Scissors, Calendar,
  LogOut, User, Wallet, Users, History, Menu, X, LayoutDashboard
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from './firebase';
import './index.css';
import Login        from './components/Login';
import Accueil      from './components/Accueil';
import Parametres   from './components/Parametres';
import Caisse       from './components/Caisse';
import Reservations from './components/Reservations';
import Bilan        from './components/Bilan';
import Tresorerie   from './components/Tresorerie';
import RH           from './components/RH';
import Tracabilite  from './components/Tracabilite';

function App() {
  const [activeTab,     setActiveTab]     = useState('accueil');
  const [dailyGoal,     setDailyGoal]     = useState(0);
  const [monthlyGoal,   setMonthlyGoal]   = useState(0);
  const [todayRevenue,  setTodayRevenue]  = useState(0);
  const [monthRevenue,  setMonthRevenue]  = useState(0);
  const [user,          setUser]          = useState(null);
  const [userRole,      setUserRole]      = useState('agent');
  const [authLoading,   setAuthLoading]   = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.actif === false) {
              await signOut(auth);
              setUser(null);
              setAuthLoading(false);
              return;
            }
            setUserRole(data.role || 'agent');
          } else {
            setUserRole('admin'); // Fallback for the first admin created manually
          }
          setUser(u);
        } catch (error) {
          console.error("Error fetching user role", error);
          setUser(u);
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Data (seulement si connecté) ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.objectifJournalier) setDailyGoal(Number(data.objectifJournalier));
        if (data.objectifMensuel)    setMonthlyGoal(Number(data.objectifMensuel));
      }
    });

    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubTx = onSnapshot(q, (snapshot) => {
      const now = new Date();
      let revDay = 0, revMonth = 0;
      snapshot.docs.forEach(d => {
        const t = docData(d);
        if (t.type !== 'prestation') return;
        const dt = new Date(t.date);
        const sameMonth = dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
        const sameDay   = sameMonth && dt.getDate() === now.getDate();
        if (sameMonth) revMonth += Number(t.montant);
        if (sameDay)   revDay   += Number(t.montant);
      });
      setTodayRevenue(revDay);
      setMonthRevenue(revMonth);
    });

    return () => { unsubSettings(); unsubTx(); };
  }, [user]);

  const docData = (d) => ({ id: d.id, ...d.data() });

  const handleSignOut = async () => {
    if (window.confirm('Voulez-vous vous déconnecter ?')) await signOut(auth);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Scissors size={36} color="var(--accent-color)" style={{ marginBottom: '12px' }} />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  // Cible journalière dynamique
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1;
  const remainingAmount = Math.max(0, monthlyGoal - monthRevenue);
  const dynamicDailyGoal = daysLeft > 0 ? Math.round(remainingAmount / daysLeft) : 0;

  const dailyPct   = dynamicDailyGoal > 0 ? Math.min((todayRevenue  / dynamicDailyGoal)   * 100, 100) : 0;
  const monthlyPct = monthlyGoal > 0 ? Math.min((monthRevenue  / monthlyGoal) * 100, 100) : 0;

  const todayStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil':      return <Accueil />;
      case 'caisse':       return <Caisse />;
      case 'reservations': return <Reservations />;
      case 'bilan':        return userRole === 'admin' ? <Bilan /> : <Accueil />;
      case 'tresorerie':   return userRole === 'admin' ? <Tresorerie /> : <Accueil />;
      case 'rh':           return userRole === 'admin' ? <RH /> : <Accueil />;
      case 'tracabilite':  return userRole === 'admin' ? <Tracabilite /> : <Accueil />;
      case 'parametres':   return userRole === 'admin' ? <Parametres /> : <Accueil />;
      default:             return <Accueil />;
    }
  };

  const MOIS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Août','Sep','Oct','Nov','Déc'];

  const navItems = [
    { key: 'accueil',      label: 'Accueil',           icon: <LayoutDashboard size={20} /> },
    { key: 'caisse',       label: 'Caisse & Journal',  icon: <Calculator size={20} /> },
    { key: 'reservations', label: 'Réservations',      icon: <Calendar size={20} /> },
    ...(userRole === 'admin' ? [
      { key: 'bilan',        label: 'Bilan Mensuel',     icon: <BarChart3 size={20} /> },
      { key: 'tresorerie',   label: 'Trésorerie',        icon: <Wallet size={20} /> },
      { key: 'rh',           label: 'RH & Avances',      icon: <Users size={20} /> },
      { key: 'tracabilite',  label: 'Traçabilité',       icon: <History size={20} /> },
      { key: 'parametres',   label: 'Paramètres',        icon: <Settings size={20} /> },
    ] : [])
  ];

  return (
    <div className="app-container">

      {/* ── OVERLAY MOBILE ──────────────────────────────────────────────── */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h1><Scissors color="var(--accent-color)" /> Barber Control</h1>
          <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`nav-btn ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.key); setIsSidebarOpen(false); }}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar"><User size={16} /></div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-email" title={user.email}>{user.email}</span>
              <span className="sidebar-user-role">{userRole === 'admin' ? 'Administrateur' : 'Agent'}</span>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-logout" title="Déconnecter">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── MAIN WRAPPER ────────────────────────────────────────────────── */}
      <div className="main-wrapper">

        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="hamburger-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="topbar-date">
              {todayStr.charAt(0).toUpperCase() + todayStr.slice(1)}
            </div>
          </div>

          {/* Widget double objectif */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            {/* Objectif Journalier */}
            <div className="topbar-goal">
              <div className="goal-labels">
                <span>Obj. Jour</span>
                <span style={{ color: dailyPct >= 100 ? 'var(--success)' : 'inherit', textAlign: 'right' }}>
                  {todayRevenue.toLocaleString('fr-FR')} / {dynamicDailyGoal.toLocaleString('fr-FR')} F
                </span>
              </div>
              <div className="goal-progress-bar">
                <div className="goal-progress-fill" style={{ width: `${dailyPct}%` }} />
              </div>
            </div>

            {/* Objectif Mensuel */}
            {monthlyGoal > 0 && (
              <div className="topbar-goal">
                <div className="goal-labels">
                  <span>Obj. {MOIS_FR[now.getMonth()]}</span>
                  <span style={{ color: monthlyPct >= 100 ? 'var(--success)' : 'inherit', textAlign: 'right' }}>
                    {monthRevenue.toLocaleString('fr-FR')} / {monthlyGoal.toLocaleString('fr-FR')} F ({Math.round(monthlyPct)}%)
                  </span>
                </div>
                <div className="goal-progress-bar">
                  <div className="goal-progress-fill"
                    style={{ width: `${monthlyPct}%`, backgroundColor: monthlyPct >= 100 ? 'var(--success)' : 'var(--accent-color)' }} />
                </div>
              </div>
            )}
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
