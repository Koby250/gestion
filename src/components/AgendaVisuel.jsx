import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Helpers
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDateISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTime = (hour, min) => {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const AgendaVisuel = ({ reservations, onTimeSlotClick, onEventClick }) => {
  const [viewMode, setViewMode] = useState('jour'); // 'jour' | 'semaine'
  const [currentDate, setCurrentDate] = useState(new Date());

  const hours = Array.from({ length: 15 }, (_, i) => i + 9); // 9 to 23

  const navigatePrev = () => {
    setCurrentDate(prev => addDays(prev, viewMode === 'jour' ? -1 : -7));
  };

  const navigateNext = () => {
    setCurrentDate(prev => addDays(prev, viewMode === 'jour' ? 1 : 7));
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  // Generate columns
  const getDays = () => {
    if (viewMode === 'jour') {
      return [currentDate];
    }
    const start = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const days = getDays();

  // Status Color Mapping
  const getEventColor = (statut) => {
    switch (statut) {
      case 'encaisse':
      case 'paye_totalement': return { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', color: '#065f46' };
      case 'acompte_verse': return { bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b', color: '#92400e' };
      case 'en_cours': return { bg: 'rgba(37, 99, 235, 0.2)', border: '#2563eb', color: '#1e40af' };
      default: return { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', color: '#991b1b' }; // non_paye
    }
  };

  // Render events for a specific day
  const renderEventsForDay = (dateObj) => {
    const dateStr = formatDateISO(dateObj);
    const dayEvents = reservations.filter(r => r.datePrevue === dateStr);

    return dayEvents.map(res => {
      if (!res.heurePrevue) return null;
      const [hStr, mStr] = res.heurePrevue.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      
      if (h < 9 || h > 23) return null; // Outside grid

      // 60px per hour
      const top = (h - 9) * 60 + m;
      const height = 60; // Fixed 1h duration for now

      const colors = getEventColor(res.statut);

      return (
        <div
          key={res.id}
          onClick={(e) => { e.stopPropagation(); onEventClick(res); }}
          style={{
            position: 'absolute',
            top: `${top}px`,
            height: `${height}px`,
            left: '4px',
            right: '4px',
            backgroundColor: colors.bg,
            borderLeft: `4px solid ${colors.border}`,
            color: colors.color,
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '0.75rem',
            overflow: 'hidden',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            zIndex: 10
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {res.heurePrevue} - {res.clientNom}
          </div>
          <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {res.serviceNom}
          </div>
          <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', opacity: 0.8 }}>
            {res.employeNom}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '800px' }}>
      
      {/* Header */}
      <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={navigateToday} className="btn" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Aujourd'hui</button>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={navigatePrev} className="btn" style={{ padding: '6px', backgroundColor: 'transparent', border: 'none' }}><ChevronLeft size={20} /></button>
            <button onClick={navigateNext} className="btn" style={{ padding: '6px', backgroundColor: 'transparent', border: 'none' }}><ChevronRight size={20} /></button>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', minWidth: '150px' }}>
            {viewMode === 'jour' 
              ? currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : `Semaine du ${getStartOfWeek(currentDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
          </h2>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', backgroundColor: 'var(--bg-input)', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => setViewMode('jour')}
            className={`nav-btn ${viewMode === 'jour' ? 'active' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
          >Jour</button>
          <button 
            onClick={() => setViewMode('semaine')}
            className={`nav-btn ${viewMode === 'semaine' ? 'active' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.85rem' }}
          >Semaine</button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{ flex: 1, display: 'flex', overflowY: 'auto', backgroundColor: 'var(--bg-card)' }}>
        
        {/* Time Column */}
        <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ height: '40px', borderBottom: '1px solid var(--border-color)' }}></div> {/* Header offset */}
          {hours.map(h => (
            <div key={h} style={{ height: '60px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {h}:00
              </span>
            </div>
          ))}
        </div>

        {/* Days Columns */}
        <div style={{ flex: 1, display: 'flex' }}>
          {days.map((dateObj, i) => {
            const isToday = formatDateISO(dateObj) === formatDateISO(new Date());
            return (
              <div key={i} style={{ flex: 1, borderRight: '1px solid var(--border-color)', minWidth: '120px', display: 'flex', flexDirection: 'column' }}>
                
                {/* Day Header */}
                <div style={{ 
                  height: '40px', 
                  borderBottom: '1px solid var(--border-color)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: isToday ? 'rgba(37,99,235,0.05)' : 'var(--bg-primary)',
                  fontWeight: isToday ? 'bold' : 'normal',
                  color: isToday ? 'var(--accent-color)' : 'var(--text-main)',
                  fontSize: '0.9rem',
                  textTransform: 'capitalize'
                }}>
                  {viewMode === 'semaine' 
                    ? dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
                    : dateObj.toLocaleDateString('fr-FR', { weekday: 'long' })}
                </div>

                {/* Day Grid */}
                <div style={{ position: 'relative', flex: 1, backgroundColor: isToday ? 'rgba(37,99,235,0.02)' : 'transparent' }}>
                  {/* Grid Lines & Clickable Slots */}
                  {hours.map(h => (
                    <div key={h} style={{ position: 'absolute', top: `${(h-9)*60}px`, width: '100%', height: '60px' }}>
                      <div 
                        onClick={() => onTimeSlotClick(formatDateISO(dateObj), formatTime(h, 0))}
                        style={{ height: '30px', borderBottom: '1px dotted var(--border-color)', cursor: 'pointer' }}
                        title={`Ajouter un rendez-vous à ${h}:00`}
                      ></div>
                      <div 
                        onClick={() => onTimeSlotClick(formatDateISO(dateObj), formatTime(h, 30))}
                        style={{ height: '30px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                        title={`Ajouter un rendez-vous à ${h}:30`}
                      ></div>
                    </div>
                  ))}

                  {/* Events */}
                  {renderEventsForDay(dateObj)}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default AgendaVisuel;
