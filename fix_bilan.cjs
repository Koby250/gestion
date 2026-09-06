const fs = require('fs');
let c = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

// Replace the broken map body (missing return + opening div) with the correct version
// The broken part starts with the map arrow and has JSX orphaned without return()
const badPattern = /(\s+\{chargesFixes\.filter\(c => c\.actif\)\.map\(c => \{[\s\S]*?const barColor[^\n]+\n)\s+<span style=\{\{ fontWeight: '600'[\s\S]*?\}\}[\s\S]*?<\/div>\s*\);\s*\}\)\}/m;

const goodReplacement = `                {chargesFixes.filter(c => c.actif).map(c => {
                  const depensesCharge = depenses.filter(t => t.categorie === c.nom);
                  const realise = depensesCharge.reduce((s, t) => s + Number(t.montant), 0);
                  const budget = Number(c.montant) || 0;
                  const pct = budget > 0 ? Math.min((realise / budget) * 100, 100) : 0;
                  const overBudget = realise > budget;
                  const barColor = overBudget ? 'var(--danger)' : pct > 75 ? '#F59E0B' : 'var(--success)';
                  return (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{c.nom}</span>
                        <span style={{ fontWeight: '600', color: overBudget ? 'var(--danger)' : 'var(--text-main)' }}>
                          {realise.toLocaleString('fr-FR')} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ {budget.toLocaleString('fr-FR')} F</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                        <div style={{ height: '100%', width: \`\${pct}%\`, backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                      {overBudget && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px' }}>
                          Depassement de {(realise - budget).toLocaleString('fr-FR')} F
                        </div>
                      )}
                    </div>
                  );
                })}`;

if (badPattern.test(c)) {
  c = c.replace(badPattern, goodReplacement);
  fs.writeFileSync('src/components/Bilan.jsx', c, 'utf8');
  console.log('Fixed successfully');
} else {
  console.log('Pattern not found, trying line-by-line approach');
  // Fallback: split lines, find the broken region, replace it
  const lines = c.split('\n');
  let mapStart = -1, mapEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('chargesFixes.filter(c => c.actif).map(c => {') && lines[i+6] && lines[i+7] && lines[i+7].includes('<span style={{ fontWeight:')) {
      mapStart = i;
    }
    if (mapStart >= 0 && lines[i].trim() === '})}' && i > mapStart + 10) {
      mapEnd = i;
      break;
    }
  }
  if (mapStart >= 0 && mapEnd >= 0) {
    const newBlock = goodReplacement.split('\n');
    lines.splice(mapStart, mapEnd - mapStart + 1, ...newBlock);
    fs.writeFileSync('src/components/Bilan.jsx', lines.join('\n'), 'utf8');
    console.log('Fixed via line-by-line at lines ' + mapStart + '-' + mapEnd);
  } else {
    console.log('Could not find broken region. mapStart=' + mapStart + ' mapEnd=' + mapEnd);
  }
}
