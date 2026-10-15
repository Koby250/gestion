import { useState, useEffect } from 'react';
import {
  Calculator, BarChart3, Settings, Scissors, Calendar,
  LogOut, User, Wallet, Users, History, Menu, X, Sun, Moon, LayoutDashboard, Package, UserCheck
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
import Inventaire   from './components/Inventaire';
import Clients      from './components/Clients';
import BirthdayWidget from './components/BirthdayWidget';

// Retourne la date locale du navigateur en format YYYY-MM-DD
// (évite le décalage UTC de toISOString() qui affiche J-1 après minuit)
const localDateStr = (d = new Date()) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

function App() {
  const [activeDate,    setActiveDate]    = useState(localDateStr());
  const [activeTab,     setActiveTab]     = useState('accueil');
  const [monthlyGoal,   setMonthlyGoal]   = useState(0);
  const [todayRevenue,  setTodayRevenue]  = useState(0);
  const [monthRevenue,  setMonthRevenue]  = useState(0);
  const [user,          setUser]          = useState(null);
  const [userRole,      setUserRole]      = useState('agent');
  const [userPerms,     setUserPerms]     = useState({ accesCaisse: false, accesReservations: false, accesInventaire: false, accesBilan: false, accesTresorerie: false, accesParametres: false, accesClients: false });
  const [userAccesInventaire, setUserAccesInventaire] = useState(false); // legacy compat
  const [currentUserNom, setCurrentUserNom] = useState('');
  const [authLoading,   setAuthLoading]   = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [prefilledReservationClient, setPrefilledReservationClient] = useState(null);

  // Dark Mode & Accent Theme
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [accentTheme, setAccentTheme] = useState(localStorage.getItem('accentTheme') || 'monochrome');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Mettre à jour dynamiquement l'icône de l'onglet du navigateur
    const favicon = document.querySelector("link[rel='icon']:not([sizes])");
    if (favicon) {
      favicon.href = theme === 'light' ? '/logos/noir.png' : '/logos/blanc.png';
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accentTheme);
    localStorage.setItem('accentTheme', accentTheme);
  }, [accentTheme]);

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
            const perms = {
              accesCaisse:       !!data.accesCaisse,
              accesReservations: !!data.accesReservations,
              accesInventaire:   !!(data.accesInventaire),
              accesBilan:        !!data.accesBilan,
              accesTresorerie:   !!data.accesTresorerie,
              accesParametres:   !!data.accesParametres,
              accesClients:      !!data.accesClients,
            };
            setUserPerms(perms);
            setUserAccesInventaire(perms.accesInventaire); // legacy compat
            setCurrentUserNom(data.nom || u.email || 'Inconnu');
          } else {
            setUserRole('admin');
            setUserAccesInventaire(true);
            setCurrentUserNom(u.email || 'Admin');
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

  const docData = (d) => ({ id: d.id, ...d.data() });

  // ── Data (seulement si connecté) ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.objectifMensuel)    setMonthlyGoal(Number(data.objectifMensuel));
      }
    });

    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubTx = onSnapshot(q, (snapshot) => {
      const activeDateObj = new Date(activeDate);
      let revDay = 0, revMonth = 0;
      snapshot.docs.forEach(d => {
        const t = docData(d);
        if (t.type !== 'prestation') return;
        const dt = new Date(t.date);
        const sameMonth = dt.getMonth() === activeDateObj.getMonth() && dt.getFullYear() === activeDateObj.getFullYear();
        const sameDay   = sameMonth && dt.getDate() === activeDateObj.getDate();
        if (sameMonth) revMonth += Number(t.montant);
        if (sameDay)   revDay   += Number(t.montant);
      });
      setTodayRevenue(revDay);
      setMonthRevenue(revMonth);
    });

    return () => { unsubSettings(); unsubTx(); };
  }, [user, activeDate]);


  const handleSignOut = async () => {
    if (window.confirm('Voulez-vous vous déconnecter ?')) await signOut(auth);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authLoading) {
    const logoSrc = theme === 'light' ? '/logos/noir.png' : '/logos/blanc.png';
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: 'var(--bg-primary)', flexDirection: 'column', gap: '20px' }}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-deep)',
            padding: '3px'
          }}>
            <img src={logoSrc} alt="Le Cercle" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'contain' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '3px', borderRadius: '99px',
            background: 'var(--btn-primary-bg)',
            animation: 'shimmer 1.5s infinite',
            backgroundSize: '200% 100%'
          }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login theme={theme === 'light' ? 'light' : 'dark'} />;

  // Cible journalière dynamique
  const activeDateObj = new Date(activeDate);
  const lastDay = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - activeDateObj.getDate() + 1;
  const remainingAmount = Math.max(0, monthlyGoal - monthRevenue);
  const dynamicDailyGoal = daysLeft > 0 ? Math.round(remainingAmount / daysLeft) : 0;

  const dailyPct   = dynamicDailyGoal > 0 ? Math.min((todayRevenue  / dynamicDailyGoal)   * 100, 100) : 0;
  const monthlyPct = monthlyGoal > 0 ? Math.min((monthRevenue  / monthlyGoal) * 100, 100) : 0;

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil':      return <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'caisse':       return (userRole === 'admin' || userPerms.accesCaisse) ? <Caisse activeDate={activeDate} currentUserNom={currentUserNom} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'reservations': return (userRole === 'admin' || userPerms.accesReservations) ? <Reservations activeDate={activeDate} prefilledClient={prefilledReservationClient} onClearPrefill={() => setPrefilledReservationClient(null)} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'clients':      return (userRole === 'admin' || userPerms.accesClients) ? <Clients onNavigateToReservation={(c) => { setPrefilledReservationClient(c); setActiveTab('reservations'); }} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'inventaire':   return (userRole === 'admin' || userPerms.accesInventaire) ? <Inventaire activeDate={activeDate} currentUserNom={currentUserNom} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'bilan':        return (userRole === 'admin' || userPerms.accesBilan) ? <Bilan activeDate={activeDate} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'tresorerie':   return (userRole === 'admin' || userPerms.accesTresorerie) ? <Tresorerie activeDate={activeDate} currentUserNom={currentUserNom} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'rh':           return userRole === 'admin' ? <RH activeDate={activeDate} currentUserNom={currentUserNom} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'tracabilite':  return userRole === 'admin' ? <Tracabilite activeDate={activeDate} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      case 'parametres':   return (userRole === 'admin' || userPerms.accesParametres) ? <Parametres activeDate={activeDate} accentTheme={accentTheme} onAccentChange={setAccentTheme} theme={theme} onThemeChange={setTheme} /> : <Accueil activeDate={activeDate} userRole={userRole} />;
      default:             return <Accueil activeDate={activeDate} userRole={userRole} />;
    }
  };

  const MOIS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Août','Sep','Oct','Nov','Déc'];

  const navItems = [
    { key: 'accueil',      label: 'Accueil',           icon: <LayoutDashboard size={20} /> },
    ...(userRole === 'admin' || userPerms.accesCaisse ? [
      { key: 'caisse',     label: 'Caisse & Journal',  icon: <Calculator size={20} /> }
    ] : []),
    ...(userRole === 'admin' || userPerms.accesReservations ? [
      { key: 'reservations', label: 'Reservations',    icon: <Calendar size={20} /> }
    ] : []),
    ...((userRole === 'admin' || userPerms.accesClients) ? [
      { key: 'clients',    label: 'Clients',            icon: <UserCheck size={20} /> }
    ] : []),
    ...((userRole === 'admin' || userPerms.accesInventaire) ? [
      { key: 'inventaire',   label: 'Inventaire',      icon: <Package size={20} /> }
    ] : []),
    ...((userRole === 'admin' || userPerms.accesBilan) ? [
      { key: 'bilan',        label: 'Bilan Mensuel',   icon: <BarChart3 size={20} /> }
    ] : []),
    ...((userRole === 'admin' || userPerms.accesTresorerie) ? [
      { key: 'tresorerie',   label: 'Tresorerie',      icon: <Wallet size={20} /> }
    ] : []),
    ...(userRole === 'admin' ? [
      { key: 'rh',           label: 'RH & Avances',    icon: <Users size={20} /> },
      { key: 'tracabilite',  label: 'Tracabilite',     icon: <History size={20} /> }
    ] : []),
    ...((userRole === 'admin' || userPerms.accesParametres) ? [
      { key: 'parametres',   label: 'Parametres',      icon: <Settings size={20} /> }
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
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={theme === 'light' ? '/logos/noir.png' : '/logos/blanc.png'}
              alt="Logo Le Cercle"
              className="sidebar-brand-logo"
              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'contain', flexShrink: 0 }}
            />
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Le Cercle</h1>
          </div>
          <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
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
            <div className="sidebar-user-avatar"><User size={15} /></div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-email" title={user.email}>{currentUserNom || user.email}</span>
              <span className="sidebar-user-role">{userRole === 'admin' ? 'Administrateur' : 'Agent'}</span>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-logout" title="Déconnecter">
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── MAIN WRAPPER ────────────────────────────────────────────────── */}
      <div className="main-wrapper">

        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="hamburger-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="topbar-date">
              <input
                type="date"
                className="input-control"
                style={{ padding: '8px 12px', width: 'auto', margin: 0, fontSize: '0.88rem' }}
                value={activeDate}
                max={localDateStr()}
                onChange={e => setActiveDate(e.target.value)}
              />
              {activeDate !== localDateStr() && (
                <span className="retroactif-badge">Mode Rétroactif</span>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 12px', borderRadius: '10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                color: 'var(--text-main)',
                flexShrink: 0,
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
              title={theme === 'light' ? 'Activer le mode sombre (Noir profond & boutons blancs)' : 'Activer le mode clair (Blanc pur & boutons noirs)'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              <span className="desktop-table">{theme === 'light' ? 'Clair' : 'Sombre'}</span>
            </button>
          </div>

          {/* Widget double objectif */}
          <div className="topbar-goals-wrapper">
            {/* Objectif Journalier */}
            <div className="topbar-goal">
              <div className="goal-labels">
                <span>Obj. Jour</span>
                <span style={{ color: dailyPct >= 100 ? 'var(--success)' : 'var(--text-soft)', fontWeight: 600 }}>
                  {todayRevenue.toLocaleString('fr-FR')} / {dynamicDailyGoal.toLocaleString('fr-FR')} F
                </span>
              </div>
              <div className="goal-progress-bar">
                <div className="goal-progress-fill goal-progress-fill--daily" style={{ width: `${dailyPct}%` }} />
              </div>
            </div>

            {/* Objectif Mensuel — admin uniquement */}
            {userRole === 'admin' && monthlyGoal > 0 && (
              <div className="topbar-goal">
                <div className="goal-labels">
                  <span>Obj. {MOIS_FR[activeDateObj.getMonth()]}</span>
                  <span style={{ color: monthlyPct >= 100 ? 'var(--success)' : 'var(--text-soft)', fontWeight: 600 }}>
                    {monthRevenue.toLocaleString('fr-FR')} / {monthlyGoal.toLocaleString('fr-FR')} F ({Math.round(monthlyPct)}%)
                  </span>
                </div>
                <div className="goal-progress-bar">
                  <div className="goal-progress-fill goal-progress-fill--monthly" style={{ width: `${monthlyPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="main-content">
          {renderContent()}
        </main>
      </div>

      {user && <BirthdayWidget />}
    </div>
  );
}

export default App;
