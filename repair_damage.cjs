const fs = require('fs');
let code = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

const targetPattern = /const goToNextMonth = \(\) => \{\s*if \(viewMonth === 11\) \{ setViewMonth\(0\); setViewYear\(y => y \+ 1\); \}\s*const totalCA\s*=\s*prestations\.reduce/;

const replacement = `const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // ── Filtrage par mois ────────────────────────────────────────────────────
  const { start, end } = getMonthBounds(viewYear, viewMonth);

  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });

  const monthAvances = (avances || []).filter(a => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });

  const prestations = monthTx.filter(t => t.type === 'prestation');
  const depenses    = monthTx.filter(t => t.type === 'depense');

  const totalCA       = prestations.reduce`;

code = code.replace(targetPattern, replacement);
fs.writeFileSync('src/components/Bilan.jsx', code, 'utf8');
console.log('Damage repaired successfully');
