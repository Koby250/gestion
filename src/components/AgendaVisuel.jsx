import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, ChevronRight, Plus, Search, Calendar as CalendarIcon, 
  List, MoreHorizontal 
} from 'lucide-react';

// Helpers
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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

const getMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

// Generate month days
const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
  let day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // 0 is Monday, 6 is Sunday
};

// MS Teams Colors
const TEAMS_COLORS = [
  { bg: 'rgba(147, 51, 234, 0.2)', border: '#9333ea', color: '#6b21a8', darkColor: '#d8b4fe' }, // Purple 600
  { bg: 'rgba(99, 102, 241, 0.2)', border: '#6366f1', color: '#4338ca', darkColor: '#a5b4fc' }, // Indigo 500
  { bg: 'rgba(168, 85, 247, 0.2)', border: '#a855f7', color: '#7e22ce', darkColor: '#e9d5ff' }, // Purple 500
  { bg: 'rgba(139, 92, 246, 0.2)', border: '#8b5cf6', color: '#6d28d9', darkColor: '#c4b5fd' }, // Violet 500
  { bg: 'rgba(79, 70, 229, 0.2)', border: '#4f46e5', color: '#3730a3', darkColor: '#818cf8' }, // Indigo 600
];

const getTeamsColor = (id) => {
  if (!id) return TEAMS_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % TEAMS_COLORS.length;
  return TEAMS_COLORS[index];
};

// Durations Reference Table
const SERVICE_DURATIONS = {
  'pédicure': 60,
  'visage': 45,
  'coiffure': 45,
  'manucure': 30,
  'gommage': 30,
  'contours': 20,
  'teinture': 20
};

const getServiceDuration = (serviceName) => {
  if (!serviceName) return 60; // default
  const normalized = serviceName.toLowerCase();
  for (const [key, duration] of Object.entries(SERVICE_DURATIONS)) {
    if (normalized.includes(key)) return duration;
  }
  return 60; // Default fallback
};

const AgendaVisuel = ({ reservations, onTimeSlotClick, onEventClick, onEventUpdate }) => {
  const [viewMode, setViewMode] = useState('jour'); 
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Theme check to adjust text color in MS teams mode
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  
  const hours = Array.from({ length: 16 }, (_, i) => i + 9); 
  const gridRef = useRef(null);

  const navigatePrev = () => {
    if (viewMode === 'jour') setCurrentDate(prev => addDays(prev, -7));
    else setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const navigateNext = () => {
    if (viewMode === 'jour') setCurrentDate(prev => addDays(prev, 7));
    else setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
    if (viewMode === 'mois') setViewMode('jour');
  };

  const handleDaySelect = (dateObj) => {
    setCurrentDate(dateObj);
    setViewMode('jour');
  };

  // --- HELPER: EXPAND RESERVATIONS BY AGENT ---
  const expandReservations = (dayEvents) => {
    let expandedEvents = [];
    dayEvents.forEach(res => {
      if (!res.heurePrevue) return;
      
      if (res.lignes && res.lignes.length > 0) {
        const resAgents = {}; 
        res.lignes.forEach(l => {
          const duration = getServiceDuration(l.serviceNom);
          if (l.agents && l.agents.length > 0) {
            l.agents.forEach(a => {
              if (!resAgents[a.id]) resAgents[a.id] = { nom: a.nom, duration: 0, services: [] };
              resAgents[a.id].duration += duration; 
              resAgents[a.id].services.push(l.serviceNom);
            });
          } else {
             if (!resAgents['unassigned']) resAgents['unassigned'] = { nom: 'Non assigné', duration: 0, services: [] };
             resAgents['unassigned'].duration += duration;
             resAgents['unassigned'].services.push(l.serviceNom);
          }
        });
        
        Object.keys(resAgents).forEach(agId => {
           expandedEvents.push({
             ...res,
             _isExpanded: true,
             _agentId: agId,
             _agentNom: resAgents[agId].nom,
             _duration: resAgents[agId].duration,
             _servicesStr: resAgents[agId].services.join(', ')
           });
        });
      } else {
        expandedEvents.push({
          ...res,
          _isExpanded: false,
          _duration: getServiceDuration(res.serviceNom),
          _agentId: res.employeId || 'unassigned'
        });
      }
    });
    return expandedEvents;
  };

  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
  };

  const handleDragLeave = (e) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  };

  const handleDrop = (e, dateStr, timeStr) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'transparent';
    const resId = e.dataTransfer.getData('resId');
    if (!resId || !onEventUpdate) return;

    // Smart Validation for Drag and Drop
    const draggedRes = reservations.find(r => r.id === resId);
    if (!draggedRes) return;

    const targetStartMins = getMinutes(timeStr);
    const expandedDragged = expandReservations([draggedRes]);
    
    // Get all OTHER events for the target day
    const dayEvents = reservations.filter(r => r.datePrevue === dateStr && r.id !== resId);
    const expandedDayEvents = expandReservations(dayEvents);
    
    let conflictAgent = null;

    for (const dragged of expandedDragged) {
      if (dragged._agentId === 'unassigned' || !dragged._agentId) continue;
      
      const draggedStart = targetStartMins;
      const draggedEnd = draggedStart + dragged._duration;
      
      const hasConflict = expandedDayEvents.some(ev => {
        if (ev._agentId !== dragged._agentId) return false; // Different agent = ok (parallel)
        
        const evStart = getMinutes(ev.heurePrevue);
        const evEnd = evStart + ev._duration;
        
        // Strict Overlap Check (start1 < end2 && end1 > start2)
        return (draggedStart < evEnd && draggedEnd > evStart);
      });
      
      if (hasConflict) {
        conflictAgent = dragged._agentNom || dragged.employeNom || 'Inconnu';
        break;
      }
    }
    
    if (conflictAgent) {
      alert(`Mouvement bloqué : l'agent ${conflictAgent} est déjà occupé sur cette plage horaire.`);
      return;
    }

    onEventUpdate(resId, dateStr, timeStr);
  };

  // --- OVERLAP ALGORITHM ---
  const processOverlaps = (dayEvents) => {
    let expandedEvents = expandReservations(dayEvents);

    // 2. Filter valid events and sort by start time
    expandedEvents.sort((a, b) => getMinutes(a.heurePrevue) - getMinutes(b.heurePrevue));
    
    // 3. Find connected components of overlaps
    const groups = [];
    let currentGroup = [];
    let currentGroupEnd = 0;

    expandedEvents.forEach(ev => {
      const start = getMinutes(ev.heurePrevue);
      const end = start + ev._duration;
      
      if (currentGroup.length === 0 || start < currentGroupEnd) {
        currentGroup.push(ev);
        currentGroupEnd = Math.max(currentGroupEnd, end);
      } else {
        groups.push(currentGroup);
        currentGroup = [ev];
        currentGroupEnd = end;
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    // 4. Calculate columns per group
    const processed = [];
    groups.forEach(group => {
      const cols = [];
      group.forEach(ev => {
        const start = getMinutes(ev.heurePrevue);
        let placed = false;
        for (let col of cols) {
          const lastEvent = col[col.length - 1];
          const lastEnd = getMinutes(lastEvent.heurePrevue) + lastEvent._duration;
          if (start >= lastEnd) {
            col.push(ev);
            placed = true;
            break;
          }
        }
        if (!placed) cols.push([ev]);
      });
      
      const numCols = cols.length;
      cols.forEach((col, colIdx) => {
        col.forEach(ev => {
          processed.push({
            ...ev,
            _colIndex: colIdx,
            _numCols: numCols
          });
        });
      });
    });
    return processed;
  };

  // --- RENDER DAY/WEEK (PLANNING) VIEW ---
  const renderPlanningView = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
    const activeDateStr = formatDateISO(currentDate);
    const dayEvents = reservations.filter(r => r.datePrevue === activeDateStr);
    const processedEvents = processOverlaps(dayEvents);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Horizontal Week Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '10px 0', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ width: '50px', flexShrink: 0 }}></div> {/* Time column spacer */}
          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between' }}>
            {weekDays.map((dateObj, i) => {
              const dateStr = formatDateISO(dateObj);
              const isToday = dateStr === formatDateISO(new Date());
              const isActive = dateStr === activeDateStr;
              
              return (
                <div 
                  key={i} 
                  onClick={() => setCurrentDate(dateObj)}
                  style={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    cursor: 'pointer' 
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', color: (isActive || isToday) ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                    {dateObj.toLocaleDateString('fr-FR', { weekday: 'short' }).charAt(0).toUpperCase()}
                  </span>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginTop: '4px',
                    backgroundColor: isActive ? 'var(--btn-primary-bg)' : (isToday ? 'var(--accent-subtle)' : 'transparent'),
                    color: isActive ? 'var(--btn-primary-text)' : 'var(--text-main)',
                    border: isToday && !isActive ? '1px solid var(--border-color)' : 'none',
                    fontWeight: (isActive || isToday) ? 'bold' : 'normal',
                    fontSize: '1.1rem'
                  }}>
                    {dateObj.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vertical Time Grid (One Day View) */}
        <div style={{ flex: 1, display: 'flex', overflowY: 'auto', backgroundColor: 'var(--bg-card)' }} ref={gridRef}>
          {/* Time Column */}
          <div style={{ width: '50px', flexShrink: 0, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            {hours.map((h, idx) => (
              <div key={h} style={{ height: '60px', position: 'relative' }}>
                {idx > 0 && (
                  <span style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {h}:00
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Grid Area */}
          <div style={{ flex: 1, position: 'relative' }}>
            {/* Grid Slots (Droppable) */}
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', top: `${(h-9)*60}px`, width: '100%', height: '60px' }}>
                <div 
                  onClick={() => onTimeSlotClick(activeDateStr, formatTime(h, 0))}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, activeDateStr, formatTime(h, 0))}
                  style={{ height: '30px', borderBottom: '1px solid var(--border-color)', opacity: 0.3, cursor: 'pointer', transition: 'background 0.2s' }}
                ></div>
                <div 
                  onClick={() => onTimeSlotClick(activeDateStr, formatTime(h, 30))}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, activeDateStr, formatTime(h, 30))}
                  style={{ height: '30px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.2s' }}
                ></div>
              </div>
            ))}

            {/* Render Events (Draggable) */}
            {processedEvents.map((res, idx) => {
              const h = Math.floor(getMinutes(res.heurePrevue) / 60);
              const m = getMinutes(res.heurePrevue) % 60;
              
              if (h < 9 || h >= 24) return null;
              
              const top = (h - 9) * 60 + m;
              const height = res._duration; // dynamically calculated duration
              
              // Width and Left for overlapping
              const widthPct = 100 / res._numCols;
              const leftPct = widthPct * res._colIndex;
              
              const colors = getTeamsColor(res.id);
              const textColor = isDark ? colors.darkColor : colors.color;

              return (
                <div
                  key={`${res.id}-${res._agentId || idx}`}
                  draggable={true}
                  onDragStart={(e) => { e.dataTransfer.setData('resId', res.id); }}
                  onClick={(e) => { e.stopPropagation(); onEventClick(res); }}
                  style={{
                    position: 'absolute',
                    top: `${top}px`,
                    height: `${Math.max(25, height - 2)}px`, // at least 25px height visually
                    left: `calc(${leftPct}% + 4px)`,
                    width: `calc(${widthPct}% - 8px)`,
                    backgroundColor: colors.bg,
                    color: textColor,
                    borderLeft: `4px solid ${colors.border}`,
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    cursor: 'grab',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    overflow: 'hidden'
                  }}
                  title={`Durée calculée: ${res._duration} min. Maintenez le clic pour déplacer ce rendez-vous.`}
                >
                  <div style={{ fontWeight: '600', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.clientNom}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{res.heurePrevue}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {res._isExpanded ? res._servicesStr : res.serviceNom}
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 'auto' }}>
                    Agent : {res._agentNom || res.employeNom}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER MONTHLY (CALENDAR) VIEW ---
  const renderMonthlyView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    const weekDaysFr = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    return (
      <div style={{ flex: 1, padding: '20px', backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
        
        {/* Month Header in content */}
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '20px', marginLeft: '5px' }}>
          {currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
        </h2>

        {/* Calendar Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
          {weekDaysFr.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>
              {d}
            </div>
          ))}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
          {blanks.map(b => (
            <div key={`blank-${b}`} style={{ height: '50px' }}></div>
          ))}
          {days.map(d => {
            const dateStr = formatDateISO(new Date(year, month, d));
            const isToday = dateStr === formatDateISO(new Date());
            const dayEvents = reservations.filter(r => r.datePrevue === dateStr);
            const hasEvents = dayEvents.length > 0;

            return (
              <div 
                key={d} 
                onClick={() => handleDaySelect(new Date(year, month, d))}
                style={{ 
                  height: '50px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  cursor: 'pointer' 
                }}
              >
                <div style={{ 
                  width: '36px', height: '36px', borderRadius: '50%', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isToday ? 'var(--btn-primary-bg)' : 'transparent',
                  color: isToday ? 'var(--btn-primary-text)' : 'var(--text-main)',
                  fontWeight: isToday ? 'bold' : 'normal',
                  fontSize: '1.1rem'
                }}>
                  {d}
                </div>
                {hasEvents && (
                  <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                    {dayEvents.slice(0, 3).map((ev, idx) => (
                      <div key={idx} style={{ 
                        width: '5px', height: '5px', borderRadius: '50%', 
                        backgroundColor: getTeamsColor(ev.id).border 
                      }} />
                    ))}
                    {dayEvents.length > 3 && (
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Monthly view shortcuts below calendar */}
        <div style={{ marginTop: '40px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
           <button 
             onClick={navigateToday}
             style={{
               width: '100%', padding: '14px', borderRadius: '12px',
               backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
               color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '1rem',
               cursor: 'pointer'
             }}
           >
             Aujourd'hui
           </button>
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '800px', backgroundColor: 'var(--bg-card)' }}>
      
      {/* HEADER (iOS Style) */}
      <div style={{ 
        padding: '12px 16px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={navigatePrev} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '4px' }}>
            <ChevronLeft size={24} />
          </button>
          
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>
            {viewMode === 'jour' 
              ? currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
              : currentDate.getFullYear()
            }
          </h2>

          <button onClick={navigateNext} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', padding: '4px' }}>
            <ChevronRight size={24} />
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', color: 'var(--accent-color)' }}>
          <button 
            onClick={() => setViewMode(viewMode === 'jour' ? 'mois' : 'jour')} 
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            title="Basculer la vue"
          >
            {viewMode === 'jour' ? <CalendarIcon size={22} /> : <List size={22} />}
          </button>
          
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} title="Rechercher">
            <Search size={22} />
          </button>
          
          <button 
            onClick={() => onTimeSlotClick(formatDateISO(currentDate), '09:00')} 
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            title="Ajouter"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* CONTENT */}
      {viewMode === 'jour' ? renderPlanningView() : renderMonthlyView()}

    </div>
  );
};

export default AgendaVisuel;
