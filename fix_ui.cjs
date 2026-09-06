const fs = require('fs');
let code = fs.readFileSync('src/components/Bilan.jsx', 'utf8');

const targetPattern = /\{\/\* Masse Salariale \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*\{\/\* Jauge Globale 4 segments \*\/\}/;

const replacement = `{/* Masse Salariale */}
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

        {/* Jauge Globale 4 segments */}`;

code = code.replace(targetPattern, replacement);
fs.writeFileSync('src/components/Bilan.jsx', code, 'utf8');
console.log('UI grid replaced successfully');
