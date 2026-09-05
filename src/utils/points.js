export const getPointsForService = (serviceNom) => {
  if (!serviceNom) return 0;
  const name = serviceNom.toLowerCase();
  
  if (name.includes('gommage') || name.includes('manucure')) return 1;
  if (name.includes('coiffure') || name.includes('coupe') || name.includes('barbe')) return 2;
  if (name.includes('visage standard')) return 3;
  if (name.includes('pédicure') || name.includes('pedicure')) return 5;
  if (name.includes('visage premium')) return 4;
  if (name.includes('visage')) return 3; // Fallback pour soin visage
  
  return 0;
};

export const computeGlobalPoints = (transactions) => {
  const pointsMap = {};
  
  (transactions || []).forEach(t => {
    if (t.type === 'prestation' && t.lignes && t.lignes.length > 0) {
      t.lignes.forEach(l => {
        const pts = getPointsForService(l.serviceNom);
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
        const pts = getPointsForService(l.serviceNom);
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
