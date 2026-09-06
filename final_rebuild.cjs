const fs = require('fs');
let code = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

// 1. Add all missing states
const stateTarget = "const [expandedAgents, setExpandedAgents] = useState({});";
const stateRepl = `const [expandedAgents, setExpandedAgents] = useState({});

  const [avances, setAvances] = useState([]);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [showSalariesClosureModal, setShowSalariesClosureModal] = useState(false);
  const [isClosingSalaries, setIsClosingSalaries] = useState(false);
  const [salaryClosureMode, setSalaryClosureMode] = useState('global');
  const [individualSalariesForm, setIndividualSalariesForm] = useState({});`;
code = code.replace(stateTarget, stateRepl);

// 2. Add handlers (Closure for Charges Fixes + Salaries)
const effectTarget = "// ── Chargement des transactions et de l'historique ───────────────────────";
const handlersRepl = `const handleClosure = async () => {
    setIsClosing(true);
    try {
      const moisLabel = \`\${MOIS_FR[viewMonth]} \${viewYear}\`;
      const now = new Date().toISOString();
      const activeCharges = chargesFixes.filter(c => c.actif);

      for (const c of activeCharges) {
        const realise = depenses
          .filter(t => t.categorie === c.nom)
          .reduce((s, t) => s + Number(t.montant), 0);
        const budget = Number(c.montant) || 0;
        const ecart = budget - realise;

        if (ecart === 0) continue;

        if (ecart > 0) {
          await addDoc(collection(db, 'transactions'), {
            type: 'prestation',
            montant: ecart,
            motif: \`Reliquat \${c.nom} — Cloture \${moisLabel}\`,
            categorie: c.nom,
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        } else {
          await addDoc(collection(db, 'transactions'), {
            type: 'depense',
            montant: Math.abs(ecart),
            motif: \`Combler deficit \${c.nom} — Cloture \${moisLabel}\`,
            categorie: c.nom,
            employeNom: 'Cloture Bilan',
            modePaiement: 'Interne',
            date: now,
            saisieParNom: 'Systeme — Bilan'
          });
        }
      }

      setShowClosureModal(false);
      alert(\`Cloture des charges (\${moisLabel}) effectuee avec succes.\`);
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la cloture des charges.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleClosureSalaries = async () => {
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

  // ── Chargement des transactions et de l'historique ───────────────────────`;
code = code.replace(effectTarget, handlersRepl);

// 3. Listen to avances_salaires in useEffect
const unsubChargesTarget = `const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), snap => {
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsubHist(); unsubEmp(); unsubCharges(); };`;
const unsubChargesRepl = `const unsubCharges = onSnapshot(collection(db, 'charges_fixes'), snap => {
      setChargesFixes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAvances = onSnapshot(collection(db, 'avances_salaires'), snap => {
      setAvances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub(); unsubHist(); unsubEmp(); unsubCharges(); unsubAvances(); };`;
code = code.replace(unsubChargesTarget, unsubChargesRepl);

// 4. monthAvances
const monthTxTarget = `const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });`;
const monthTxRepl = `const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });

  const monthAvances = avances.filter(a => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });`;
code = code.replace(monthTxTarget, monthTxRepl);

// 5. Replace Grid (Masse Salariale, Charges Fixes, Rentabilité)
const gridTargetPattern = /\{\/\* Masse Salariale \*\/\}[\s\S]*?(?=\{\/\* ── Top 3 Agents du Mois)/;

const gridRepl = `{/* Masse Salariale */}
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

          {/* Charges Fixes — Suivi temps réel */}
          <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Charges Fixes Mensuelles</div>

            {(() => {
              const totalRealise = chargesFixes.filter(c => c.actif).reduce((s, c) => {
                return s + depenses.filter(t => t.categorie === c.nom).reduce((x, t) => x + Number(t.montant), 0);
              }, 0);
              const totalBudget = totalChargesFixes;
              const ecart = totalBudget - totalRealise;
              const pctGlobal = totalBudget > 0 ? Math.min((totalRealise / totalBudget) * 100, 100) : 0;
              const overAll = totalRealise > totalBudget;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: overAll ? 'var(--danger)' : 'var(--text-main)' }}>
                      {totalRealise.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>/ {totalBudget.toLocaleString('fr-FR')} F alloués</div>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '6px' }}>
                    <div style={{ height: '100%', width: \`\${pctGlobal}%\`, backgroundColor: overAll ? 'var(--danger)' : pctGlobal > 75 ? '#F59E0B' : 'var(--success)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Part du CA</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>{totalCA > 0 ? Math.round(pctChargesFixes) : 0}%</span>
                  </div>
                  {ecart !== 0 && (
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: ecart > 0 ? 'var(--success)' : 'var(--danger)', marginBottom: '6px' }}>
                      {ecart > 0
                        ? \`Reliquat disponible : +\${ecart.toLocaleString('fr-FR')} F\`
                        : \`Déficit global : \${ecart.toLocaleString('fr-FR')} F\`}
                    </div>
                  )}
                </>
              );
            })()}

            {chargesFixes.filter(c => c.actif).length > 0 ? (
              <div style={{ marginTop: '12px', borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: '10px' }}>
                {chargesFixes.filter(c => c.actif).map(c => {
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
                })}
              </div>
            ) : (
              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune charge configurée. Voir Paramètres.</div>
            )}

            {chargesFixes.filter(c => c.actif).length > 0 && (
              <button
                onClick={() => setShowClosureModal(true)}
                className="btn"
                style={{ marginTop: '14px', width: '100%', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
              >
                Cloturer les charges fixes
              </button>
            )}
          </div>

          {/* Seuil de Rentabilité & Marge Nette */}
          <div style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Seuil de Rentabilité & Marge
            </div>
            {(() => {
              const seuilRentabilite = totalSalaires + totalChargesFixes;
              const caPct = seuilRentabilite > 0 ? Math.min((totalCA / seuilRentabilite) * 100, 100) : 100;
              const seuilAtteint = totalCA >= seuilRentabilite;
              
              const totalD = depenses.reduce((s, t) => s + Number(t.montant), 0);
              const margeNette = totalCA - totalSalaires - totalD;
              const margePct = totalCA > 0 ? (margeNette / totalCA) * 100 : 0;

              return (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Point Mort</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{seuilRentabilite.toLocaleString('fr-FR')} F</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CA Actuel</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: seuilAtteint ? 'var(--success)' : '#F59E0B' }}>{totalCA.toLocaleString('fr-FR')} F</div>
                      </div>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', marginBottom: '4px' }}>
                      <div style={{ height: '100%', width: \`\${caPct}%\`, backgroundColor: seuilAtteint ? 'var(--success)' : '#F59E0B', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '600', color: seuilAtteint ? 'var(--success)' : '#F59E0B', textAlign: 'center' }}>
                      {seuilAtteint ? \`Seuil dépassé de \${(totalCA - seuilRentabilite).toLocaleString('fr-FR')} F\` : \`Manque \${(seuilRentabilite - totalCA).toLocaleString('fr-FR')} F pour atteindre le seuil\`}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Marge Nette Opérationnelle</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: '800', color: margeNette >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {margePct.toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '0.85rem', color: margeNette >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                        ({margeNette >= 0 ? '+' : ''}{margeNette.toLocaleString('fr-FR')} F)
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Top 3 Agents du Mois`;
code = code.replace(gridTargetPattern, gridRepl);

// 6. Add modals at the end
const modalsRepl = `
      {/* MODALE DE CLOTURE DES CHARGES FIXES */}
      {showClosureModal && (() => {
        const activeCharges = chargesFixes.filter(c => c.actif);
        const lines = activeCharges.map(c => {
          const realise = depenses.filter(t => t.categorie === c.nom).reduce((s, t) => s + Number(t.montant), 0);
          const budget = Number(c.montant) || 0;
          const ecart = budget - realise;
          return { ...c, realise, budget, ecart };
        });
        const ecartGlobal = lines.reduce((s, l) => s + l.ecart, 0);

        return (
          <div className="modal-overlay" onClick={() => setShowClosureModal(false)}>
            <div className="modal-content" style={{ maxWidth: '500px', width: '95%' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ marginBottom: '6px', fontSize: '1.15rem' }}>Cloture des charges — {MOIS_FR[viewMonth]} {viewYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Cette action va generer les transactions d'ajustement dans la tresorerie pour combler les deficits ou reverser les reliquats du mois.
              </p>

              {lines.length === 0 ? (
                <div style={{ color: 'var(--text-muted)' }}>Aucune charge active pour ce mois.</div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  {lines.map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                      <div>
                        <div style={{ fontWeight: '600' }}>{l.nom}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Budget: {l.budget.toLocaleString('fr-FR')} | Depense: {l.realise.toLocaleString('fr-FR')}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: '700', color: l.ecart > 0 ? 'var(--success)' : l.ecart < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {l.ecart === 0 ? 'Equilibre' : l.ecart > 0 ? \`+ \${l.ecart.toLocaleString('fr-FR')} F\` : \`- \${Math.abs(l.ecart).toLocaleString('fr-FR')} F\`}
                        <div style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>
                          {l.ecart > 0 ? 'Reversement' : l.ecart < 0 ? 'A combler' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                    <span>Ecart net global</span>
                    <span style={{ color: ecartGlobal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {ecartGlobal >= 0 ? \`+\${ecartGlobal.toLocaleString('fr-FR')}\` : ecartGlobal.toLocaleString('fr-FR')} F
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {lines.length > 0 && (
                  <button
                    onClick={handleClosure}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isClosing}
                  >
                    {isClosing ? 'Regularisation en cours...' : 'Confirmer la cloture'}
                  </button>
                )}
                <button
                  onClick={() => setShowClosureModal(false)}
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
export default Bilan;`;
code = code.replace(/\s*<\/div>\s*\);\s*};\s*export default Bilan;/, modalsRepl);

fs.writeFileSync('src/components/Bilan.jsx', code, 'utf8');
console.log('Final rebuild executed.');
