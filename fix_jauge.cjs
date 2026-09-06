const fs = require('fs');
let code = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

const targetPattern = /\{\/\* Jauge Globale 4 segments \*\/\}([\s\S]*?)<\/div>\s*<\/div>/;

const replacement = `{/* Jauge Globale 3 segments */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', fontWeight: 'bold', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-color)' }}>Salaires : {totalCA > 0 ? Math.round((totalSalaires / totalCA) * 100) : 0}%</span>
            <span style={{ color: 'var(--danger)' }}>Charges Fixes : {totalCA > 0 ? Math.round((totalChargesFixes / totalCA) * 100) : 0}%</span>
            <span style={{ color: 'var(--success)' }}>Marge nette : {totalCA > 0 ? Math.round(((totalCA - totalSalaires - depenses.reduce((s,t)=>s+Number(t.montant),0)) / totalCA) * 100) : 0}%</span>
          </div>
          <div style={{ width: '100%', height: '14px', display: 'flex', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ width: \`\${totalCA > 0 ? Math.min((totalSalaires / totalCA) * 100, 100) : 0}%\`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease' }} />
            <div style={{ width: \`\${totalCA > 0 ? Math.min((totalChargesFixes / totalCA) * 100, 100) : 0}%\`, backgroundColor: 'var(--danger)', transition: 'width 0.5s ease' }} />
            <div style={{ width: \`\${totalCA > 0 ? Math.max(((totalCA - totalSalaires - depenses.reduce((s,t)=>s+Number(t.montant),0)) / totalCA) * 100, 0) : 0}%\`, backgroundColor: 'var(--success)', transition: 'width 0.5s ease' }} />
          </div>
        </div>`;

code = code.replace(targetPattern, replacement);
fs.writeFileSync('src/components/Bilan.jsx', code, 'utf8');
console.log('Gauge fixed successfully');
