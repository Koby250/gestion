export const getPointsForService = (serviceNom, transactionDate = null) => {
  if (!serviceNom) return 0;
  const name = serviceNom.toLowerCase();
  
  // A partir du 15 Septembre 2026, les nouvelles règles s'appliquent.
  let isNewRule = true;
  if (transactionDate) {
    const txDateStr = transactionDate.substring(0, 10);
    if (txDateStr < '2026-09-15') {
      isNewRule = false;
    }
  }

  // Autres services (inchangés)
  if (name.includes('gommage') || name.includes('manucure')) return 1;
  if (name.includes('pédicure') || name.includes('pedicure')) return 5;
  if (name.includes('visage premium')) return 4;
  if (name.includes('visage standard')) return 3;
  if (name.includes('visage')) return 3; // Fallback
  
  // Prestations de coiffure principale
  if (name.includes('coiffure') || name.includes('coupe') || name.includes('barbe')) {
    return isNewRule ? 1 : 2;
  }
  
  // Prestations capillaires annexes (uniquement avec nouvelle règle)
  if (isNewRule) {
    if (
      name.includes('teinture') || 
      name.includes('défrisage') || 
      name.includes('defrisage') || 
      name.includes('coloration') || 
      name.includes('shampooing') || 
      name.includes('shampoing') || 
      name.includes('soin capillaire')
    ) {
      return 0.5;
    }
  }
  
  return 0;
};

export const computeGlobalPoints = (transactions) => {
  const pointsMap = {};
  
  (transactions || []).forEach(t => {
    if (t.type === 'prestation' && t.lignes && t.lignes.length > 0) {
      t.lignes.forEach(l => {
        const pts = getPointsForService(l.serviceNom, t.date);
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
        const pts = getPointsForService(l.serviceNom, t.date);
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
