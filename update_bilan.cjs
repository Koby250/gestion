const fs = require('fs');
let code = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

// 1. Add states
const statePattern = /const \[showClosureModal, setShowClosureModal\] = useState\(false\);\s*const \[isClosing, setIsClosing\] = useState\(false\);/;
const stateRepl = `const [showClosureModal, setShowClosureModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Salaries Closure modal
  const [showSalariesClosureModal, setShowSalariesClosureModal] = useState(false);
  const [isClosingSalaries, setIsClosingSalaries] = useState(false);
  const [salaryClosureMode, setSalaryClosureMode] = useState('global');
  const [individualSalariesForm, setIndividualSalariesForm] = useState({});
  const [avances, setAvances] = useState([]);`;
code = code.replace(statePattern, stateRepl);

// 2. Add handleClosureSalaries
const handleClosurePattern = /const handleClosure = async \(\) => \{/;
const handleClosureSalaries = `const handleClosureSalaries = async () => {
    setIsClosingSalaries(true);
    try {
      const moisLabel = \`\${MOIS_FR[viewMonth]} \${viewYear}\`;
      const now = new Date().toISOString();
      const activeEmployes = employes.filter(e => e.actif);

      for (const emp of activeEmployes) {
        const empAvances = monthAvances
          .filter(a => a.employeId === emp.id)
          .reduce((sum, a) => sum + Number(a.montant), 0);
        const salaireFixe = Number(emp.salaireFixe) || 0;
        let aVerser = 0;

        if (salaryClosureMode === 'global') {
          aVerser = Math.max(0, salaireFixe - empAvances);
        } else {
          aVerser = Number(individualSalariesForm[emp.id]) || 0;
        }

        if (aVerser > 0) {
          await addDoc(collection(db, 'transactions'), {
            type: 'depense',
            montant: aVerser,
            motif: \`Cloture Salaire - \${emp.nom} (\${moisLabel})\`,
            categorie: 'Paiement Salaires',
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        }
      }

      setShowSalariesClosureModal(false);
      alert(\`Cloture des salaires (\${moisLabel}) effectuee avec succes.\`);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la cloture des salaires.');
    } finally {
      setIsClosingSalaries(false);
    }
  };

  const handleClosure = async () => {`;
code = code.replace(handleClosurePattern, handleClosureSalaries);

// 3. Add listener
const listenerPattern = /const unsubCharges = onSnapshot\(collection\(db, 'charges_fixes'\), snap => \{\s*setChargesFixes\(snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\)\);\s*\}\);\s*return \(\) => \{ unsub\(\); unsubHist\(\); unsubEmp\(\); unsubCharges\(\); \};/;
const listenerRepl = `const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), snap => {
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAvances = onSnapshot(collection(db, 'avances_salaires'), snap => {
      setAvances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsubHist(); unsubEmp(); unsubCharges(); unsubAvances(); };`;
code = code.replace(listenerPattern, listenerRepl);

// 4. Add monthAvances
const monthTxPattern = /const monthTx = transactions\.filter\(t => \{\s*const d = new Date\(t\.date\);\s*return d >= start && d <= end;\s*\}\);/;
const monthTxRepl = `const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });

  const monthAvances = avances.filter(a => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });`;
code = code.replace(monthTxPattern, monthTxRepl);

// 5. Replace Masse Salariale Card
const masseSalarialePattern = /\{\/\* Masse Salariale \*\/\}[\s\S]*?(?=\{\/\* Charges Fixes — Suivi temps réel \*\/})/;
const masseSalarialeRepl = `{/* Masse Salariale */}
          <div style={{ backgroundColor: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Masse Salariale — {employes.filter(e => e.actif).length} agents
            </div>

            {(() => {
              const totalVersé = employes.filter(e => e.actif).reduce((s, emp) => {
                return s + monthAvances.filter(a => a.employeId === emp.id).reduce((x, a) => x + Number(a.montant), 0);
              }, 0);
              const pctVerse = totalSalaires > 0 ? Math.min((totalVersé / totalSalaires) * 100, 100) : 0;
              const completed = totalVersé >= totalSalaires;

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                      {totalVersé.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>/ {totalSalaires.toLocaleString('fr-FR')} F (total)</div>
                  </div>
                  
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: \`\${pctVerse}%\`, backgroundColor: completed ? 'var(--success)' : 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Part du CA global</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{totalCA > 0 ? Math.round(pctSalaires) : 0}%</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: completed ? 'var(--success)' : 'var(--text-main)', marginBottom: '8px' }}>
                    {completed ? 'Salaires entierement verses' : \`Reste a verser : \${(totalSalaires - totalVersé).toLocaleString('fr-FR')} F\`}
                  </div>
                </>
              );
            })()}

            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(37,99,235,0.15)', paddingTop: '10px' }}>
              {employes.filter(e => e.actif).map(e => {
                const verse = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                const base = Number(e.salaireFixe) || 0;
                const reste = Math.max(0, base - verse);
                return (
                  <div key={e.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(37,99,235,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: '500' }}>{e.nom}</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {verse.toLocaleString('fr-FR')} <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>/ {base.toLocaleString('fr-FR')} F</span>
                      </span>
                    </div>
                    {reste > 0 ? (
                      <div style={{ fontSize: '0.72rem', color: '#F59E0B' }}>Reste : {reste.toLocaleString('fr-FR')} F</div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>Solde</div>
                    )}
                  </div>
                );
              })}
            </div>

            {employes.filter(e => e.actif).length > 0 && (
              <button
                onClick={() => {
                  const initForm = {};
                  employes.filter(e => e.actif).forEach(e => {
                    const verse = monthAvances.filter(a => a.employeId === e.id).reduce((s, a) => s + Number(a.montant), 0);
                    const reste = Math.max(0, (Number(e.salaireFixe) || 0) - verse);
                    initForm[e.id] = reste;
                  });
                  setIndividualSalariesForm(initForm);
                  setSalaryClosureMode('global');
                  setShowSalariesClosureModal(true);
                }}
                className="btn"
                style={{ marginTop: '14px', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
              >
                Cloturer les salaires
              </button>
            )}
          </div>

          `;
code = code.replace(masseSalarialePattern, masseSalarialeRepl);

// 6. Add Modal before the last </div>\n  );\n};\n\nexport default Bilan;
const modalHTML = `
      {/* MODALE DE CLOTURE DES SALAIRES */}
      {showSalariesClosureModal && (() => {
        const activeEmployes = employes.filter(e => e.actif);
        
        let totalGlobalRestant = 0;
        const employeeLines = activeEmployes.map(emp => {
          const verse = monthAvances.filter(a => a.employeId === emp.id).reduce((s, a) => s + Number(a.montant), 0);
          const base = Number(emp.salaireFixe) || 0;
          const reste = Math.max(0, base - verse);
          totalGlobalRestant += reste;
          return { ...emp, verse, base, reste };
        });

        let totalToPay = 0;
        if (salaryClosureMode === 'global') {
          totalToPay = totalGlobalRestant;
        } else {
          totalToPay = Object.values(individualSalariesForm).reduce((s, v) => s + (Number(v) || 0), 0);
        }

        return (
          <div className="modal-overlay" onClick={() => setShowSalariesClosureModal(false)}>
            <div className="modal-content" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: '6px', fontSize: '1.15rem' }}>Cloture des salaires — {MOIS_FR[viewMonth]} {viewYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Cette operation regularise le paiement des salaires. Les montants verses seront enregistres dans le journal des operations.
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button 
                  onClick={() => setSalaryClosureMode('global')}
                  className={\`btn \${salaryClosureMode === 'global' ? 'btn-primary' : ''}\`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'global' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'global' ? 'var(--text-main)' : undefined }}
                >
                  Globale
                </button>
                <button 
                  onClick={() => setSalaryClosureMode('individuel')}
                  className={\`btn \${salaryClosureMode === 'individuel' ? 'btn-primary' : ''}\`}
                  style={{ flex: 1, backgroundColor: salaryClosureMode !== 'individuel' ? 'var(--bg-input)' : undefined, color: salaryClosureMode !== 'individuel' ? 'var(--text-main)' : undefined }}
                >
                  Individuelle par agent
                </button>
              </div>

              {totalGlobalRestant === 0 ? (
                <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', textAlign: 'center', color: 'var(--success)', fontWeight: '600', marginBottom: '16px' }}>
                  Tous les salaires de ce mois ont deja ete verses integralement via les avances.
                </div>
              ) : (
                <div style={{ marginBottom: '16px', backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {employeeLines.map(emp => (
                    <div key={emp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{emp.nom}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Base : {emp.base.toLocaleString('fr-FR')} F | Avances : {emp.verse.toLocaleString('fr-FR')} F
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{ fontSize: '0.8rem', color: emp.reste > 0 ? '#F59E0B' : 'var(--success)' }}>
                          Reste du : {emp.reste.toLocaleString('fr-FR')} F
                        </div>
                        {salaryClosureMode === 'individuel' && emp.reste > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>A verser :</label>
                            <input 
                              type="number"
                              min="0"
                              max={emp.reste}
                              value={individualSalariesForm[emp.id] !== undefined ? individualSalariesForm[emp.id] : ''}
                              onChange={(e) => setIndividualSalariesForm({ ...individualSalariesForm, [emp.id]: e.target.value })}
                              style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', textAlign: 'right' }}
                            />
                          </div>
                        )}
                        {salaryClosureMode === 'global' && emp.reste > 0 && (
                          <div style={{ fontWeight: '600', color: 'var(--accent-color)' }}>
                            Paiement : {emp.reste.toLocaleString('fr-FR')} F
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  <div style={{ marginTop: '14px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                    <span>Total a verser (Trésorerie)</span>
                    <span style={{ color: 'var(--danger)' }}>- {totalToPay.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {totalGlobalRestant > 0 && (
                  <button
                    onClick={handleClosureSalaries}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isClosingSalaries || totalToPay <= 0}
                  >
                    {isClosingSalaries ? 'Validation en cours...' : 'Valider la cloture'}
                  </button>
                )}
                <button
                  onClick={() => setShowSalariesClosureModal(false)}
                  className="btn"
                  style={{ flex: 1, backgroundColor: 'var(--bg-input)', color: 'var(--text-main)' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Bilan;
`;

const lastPart = /\s*<\/div>\s*\);\s*};\s*export default Bilan;/;
code = code.replace(lastPart, modalHTML);

fs.writeFileSync('src/components/Bilan.jsx', code, 'utf8');
console.log('Script updated Bilan.jsx successfully.');
