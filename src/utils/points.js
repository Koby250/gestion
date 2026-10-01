export const getPointsForService = (serviceNom, transactionDate = null, isDomicile = false) => {
  if (!serviceNom) return 0;
  const name = serviceNom.toLowerCase();
  
  // A partir du 1er Septembre 2026, les nouvelles règles s'appliquent pour tout le mois en cours.
  let isNewRule = true;
  if (transactionDate) {
    const txDateStr = transactionDate.substring(0, 10);
    if (txDateStr < '2026-09-01') {
      isNewRule = false;
    }
  }

  let basePoints = 0;

  // Autres services (inchangés)
  if (name.includes('gommage')) basePoints = 2;
  else if (name.includes('manucure')) basePoints = 1;
  else if (name.includes('pédicure') || name.includes('pedicure')) basePoints = 5;
  else if (name.includes('visage premium')) basePoints = 4;
  else if (name.includes('visage standard')) basePoints = 3;
  else if (name.includes('visage')) basePoints = 3; // Fallback
  
  // Prestations de coiffure principale et tout ce qui est lié aux cheveux (contours, coloration, etc.)
  else if (
    name.includes('coiffure') || 
    name.includes('coupe') || 
    name.includes('barbe') ||
    name.includes('contour') ||
    name.includes('teinture') || 
    name.includes('défrisage') || 
    name.includes('defrisage') || 
    name.includes('coloration') || 
    name.includes('décoloration') || 
    name.includes('decoloration') || 
    name.includes('shampooing') || 
    name.includes('shampoing') || 
    name.includes('soin capillaire')
  ) {
    basePoints = isNewRule ? 1 : 2;
  }
  
  return basePoints + (isDomicile ? 1 : 0);
};

export const computeGlobalPoints = (transactions) => {
  const pointsMap = {};
  
  (transactions || []).forEach(t => {
    if (t.type === 'prestation' && t.lignes && t.lignes.length > 0) {
      t.lignes.forEach(l => {
        const pts = getPointsForService(l.serviceNom, t.date, !!l.isDomicile);
        const agents = l.agents || [];
        const numAgents = agents.length || 1;
        const ptsToGive = pts / numAgents;
        
        agents.forEach(ag => {
          if (ag.id) {
            pointsMap[ag.id] = (pointsMap[ag.id] || 0) + ptsToGive;
          }
        });
      });
    }
  });
  
  return pointsMap;
};

export const computeDetailedGlobalStats = (transactions) => {
  const statsMap = {};
  
  (transactions || []).forEach(t => {
    if (t.type === 'prestation' && t.lignes && t.lignes.length > 0) {
      t.lignes.forEach(l => {
        const pts = getPointsForService(l.serviceNom, t.date, !!l.isDomicile);
        const agents = l.agents || [];
        const numAgents = agents.length || 1;
        const ptsToGive = pts / numAgents;
        
        agents.forEach(ag => {
          if (ag.id) {
            if (!statsMap[ag.id]) {
                statsMap[ag.id] = { points: 0, services: {} };
            }
            statsMap[ag.id].points += ptsToGive;
            
            const sName = l.serviceNom || 'Autre';
            statsMap[ag.id].services[sName] = (statsMap[ag.id].services[sName] || 0) + 1;
          }
        });
      });
    }
  });
  
  return statsMap;
};
