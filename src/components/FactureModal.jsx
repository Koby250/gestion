import { useState } from 'react';
import { X, Download, Image, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const FactureModal = ({ data, type = 'reservation', onClose }) => {
  const [showNotes, setShowNotes] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);

  const isPaid =
    type === 'transaction' ||
    (type === 'reservation' &&
      (data.statut === 'encaisse' || data.statut === 'paye_totalement'));

  const captureCanvas = async () => {
    const element = document.getElementById('facture-print-area');
    return html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      const fileName =
        type === 'reservation'
          ? `Facture_${data.clientNom || 'Client'}_${dateFormatee.replace(/\//g, '-')}.pdf`
          : `Recu_${(data.id || '').slice(0, 8).toUpperCase()}.pdf`;
      pdf.save(fileName);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    setIsGeneratingImg(true);
    try {
      const canvas = await captureCanvas();
      // Compress to JPEG at 85% quality — typically 150–400 KB
      const link = document.createElement('a');
      link.download =
        type === 'reservation'
          ? `Facture_${data.clientNom || 'Client'}_${dateFormatee.replace(/\//g, '-')}.jpg`
          : `Recu_${(data.id || '').slice(0, 8).toUpperCase()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.85);
      link.click();
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const dateFormatee = new Date(
    data.datePrevue || data.date || data.createdAt
  ).toLocaleDateString('fr-FR');
  const heureFormatee =
    data.heurePrevue ||
    new Date(data.date || data.createdAt).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const totalFacture = data.lignes
    ? data.lignes.reduce((a, l) => a + Number(l.prixFinal || 0), 0)
    : data.prixTotal || data.montant || 0;

  const resteAPayer =
    type === 'reservation'
      ? totalFacture - (data.acomptePaye || 0)
      : totalFacture;

  const numFacture = `LC-${(data.id || '').slice(0, 8).toUpperCase()}`;

  return (
    <div className="modal-overlay hide-on-print">
      <div
        className="modal-content"
        style={{
          maxWidth: '680px',
          width: '100%',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* ── Header Modale ─────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', color: 'var(--text-main)' }}>
            <FileText size={18} color="var(--text-main)" />
            {type === 'reservation' ? 'Facture de Réservation' : 'Reçu de Caisse'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* ── Zone scrollable ──────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', backgroundColor: '#e5e5e5', padding: '16px 12px', minHeight: 0 }}>

          {/* ══ FACTURE (100% NOIR & BLANC PRO) ══════════════════ */}
          <div
            id="facture-print-area"
            className="print-area"
            style={{
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              backgroundColor: '#ffffff',
              color: '#000000',
              width: '100%',
              maxWidth: '620px',
              margin: '0 auto',
              boxSizing: 'border-box',
              border: '1px solid #d4d4d4',
            }}
          >
            {/* Ligne supérieure noire */}
            <div style={{ height: '6px', backgroundColor: '#000000' }} />

            <div style={{ padding: '32px 36px 28px' }}>
              {/* EN-TÊTE */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                paddingBottom: '24px',
                borderBottom: '2px solid #000000',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src="/logos/blanc.png"
                    alt="Le Cercle"
                    crossOrigin="anonymous"
                    style={{
                      height: '52px',
                      width: '52px',
                      borderRadius: '50%',
                      objectFit: 'contain',
                      display: 'block',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <h2 style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: '900',
                      letterSpacing: '2.5px',
                      color: '#000000',
                      textTransform: 'uppercase',
                      lineHeight: '1.1',
                    }}>
                      LE CERCLE
                    </h2>
                    <p style={{
                      margin: '4px 0 0 0',
                      fontSize: '9.5px',
                      fontWeight: '600',
                      letterSpacing: '1.8px',
                      color: '#555555',
                      textTransform: 'uppercase',
                    }}>
                      Espace &amp; Services de Prestige
                    </p>
                    <p style={{
                      margin: '5px 0 0 0',
                      fontSize: '11px',
                      color: '#333333',
                      fontWeight: '500',
                    }}>
                      Tél : +227 87 37 73 70 · Niamey, Niger
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <p style={{
                    margin: 0,
                    fontSize: '22px',
                    fontWeight: '900',
                    color: '#000000',
                    letterSpacing: '3px',
                    textTransform: 'uppercase',
                    lineHeight: '1',
                  }}>
                    {type === 'reservation' ? 'FACTURE' : 'REÇU'}
                  </p>
                  <p style={{
                    margin: '6px 0 0 0',
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#000000',
                    letterSpacing: '0.5px',
                  }}>
                    N° {numFacture}
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#555555' }}>
                    {new Date(data.datePrevue || data.date || data.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })} à {heureFormatee}
                  </p>
                </div>
              </div>

              {/* INFOS CLIENT & RDV */}
              <div style={{
                padding: '20px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid #e5e5e5',
              }}>
                <div>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '9px',
                    fontWeight: '800',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: '#777777',
                  }}>
                    FACTURÉ À
                  </p>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#000000' }}>
                    {data.clientNom || 'Client Anonyme'}
                  </p>
                  {data.clientTel && (
                    <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#444444', fontWeight: '500' }}>
                      Tél : {data.clientTel}
                    </p>
                  )}
                  {data.promotionNom && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '6px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #d1d5db',
                      fontSize: '10px',
                      fontWeight: '700',
                      color: '#111827'
                    }}>
                      <span>🏷️ Offre Promo :</span>
                      <span>{data.promotionNom}</span>
                    </div>
                  )}
                </div>

                {type === 'reservation' && data.datePrevue && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{
                      margin: '0 0 4px 0',
                      fontSize: '9px',
                      fontWeight: '800',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      color: '#777777',
                    }}>
                      RENDEZ-VOUS PRÉVU
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#000000', textTransform: 'capitalize' }}>
                      {new Date(data.datePrevue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#444444', fontWeight: '500' }}>
                      à {heureFormatee}
                    </p>
                  </div>
                )}
              </div>

              {/* TABLEAU PRESTATIONS */}
              <div style={{ padding: '20px 0 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderTop: '1.5px solid #000000', borderBottom: '1.5px solid #000000' }}>
                      <th style={{ padding: '10px 8px 10px 0', color: '#000000', fontSize: '9.5px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'left' }}>
                        Désignation
                      </th>
                      <th style={{ padding: '10px 8px', color: '#000000', fontSize: '9.5px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center' }}>
                        Intervenant
                      </th>
                      <th style={{ padding: '10px 8px', color: '#000000', fontSize: '9.5px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'right' }}>
                        Prix Base
                      </th>
                      <th style={{ padding: '10px 0 10px 8px', color: '#000000', fontSize: '9.5px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'right' }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lignes && data.lignes.length > 0 ? (
                      data.lignes.map((ligne, index) => {
                        const isBillard = ligne.isBillard || (ligne.serviceNom || '').toLowerCase().includes('billard');
                        const nomAffiche = isBillard && (ligne.nombreParties || 1) > 1
                          ? `${ligne.serviceNom || 'Billard'} (${ligne.nombreParties} parties)`
                          : (ligne.serviceNom || 'Prestation');
                        const agentAffiche = (ligne.agents && ligne.agents.length > 0)
                          ? ligne.agents.map(a => a.nom).join(', ')
                          : (isBillard ? '—' : (ligne.employeNom || '—'));

                        return (
                          <tr key={index} style={{ borderBottom: '1px solid #eaeaea' }}>
                            <td style={{ padding: '12px 8px 12px 0', fontSize: '12.5px' }}>
                              <strong style={{ color: '#000000', fontWeight: '700' }}>{nomAffiche}</strong>
                              {(ligne.promotionNom || (data.promotionNom && ligne.isPromo)) && (
                                <div style={{ fontSize: '10px', color: '#111827', fontWeight: '600', marginTop: '2px' }}>
                                  🎁 Offre : {ligne.promotionNom || data.promotionNom}
                                </div>
                              )}
                              {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                                <div style={{ fontSize: '10.5px', color: '#555555', fontStyle: 'italic', marginTop: '2px' }}>
                                  Remise : {ligne.remiseMotif}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11.5px', color: '#444444' }}>
                              {agentAffiche}
                            </td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '11.5px', color: '#777777' }}>
                              {ligne.remiseType && ligne.remiseType !== 'aucune' ? (
                                <span style={{ textDecoration: 'line-through' }}>{Number(ligne.prixBase).toLocaleString('fr-FR')} F</span>
                              ) : `${Number(ligne.prixBase).toLocaleString('fr-FR')} F`}
                            </td>
                            <td style={{ padding: '12px 0 12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: '800', color: '#000000' }}>
                              {Number(ligne.prixFinal).toLocaleString('fr-FR')} FCFA
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr style={{ borderBottom: '1px solid #eaeaea' }}>
                        <td style={{ padding: '12px 8px 12px 0', fontSize: '12.5px' }}>
                          <strong style={{ color: '#000000', fontWeight: '700' }}>{data.serviceNom || data.motif || 'Prestation'}</strong>
                          {data.reductionActive && (
                            <div style={{ fontSize: '10.5px', color: '#555555', fontStyle: 'italic', marginTop: '2px' }}>
                              Remise : {data.reductionMotif}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11.5px', color: '#444444' }}>
                          {data.employeNom || '—'}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '11.5px', color: '#777777' }}>
                          {data.reductionActive ? (
                            <span style={{ textDecoration: 'line-through' }}>{data.prixOriginal} F</span>
                          ) : `${data.prixTotal || data.montant || 0} F`}
                        </td>
                        <td style={{ padding: '12px 0 12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: '800', color: '#000000' }}>
                          {(data.prixTotal || data.montant || 0).toLocaleString('fr-FR')} FCFA
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTAUX + STATUT */}
              <div style={{
                paddingTop: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}>
                {/* Tampon statut monochrome */}
                <div>
                  {isPaid ? (
                    <div style={{
                      display: 'inline-block',
                      border: '2px solid #000000',
                      color: '#000000',
                      fontWeight: '900',
                      fontSize: '13px',
                      padding: '6px 16px',
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                    }}>
                      PAYÉ
                    </div>
                  ) : (
                    <div style={{
                      display: 'inline-block',
                      border: '1.5px dashed #333333',
                      color: '#333333',
                      fontWeight: '800',
                      fontSize: '10.5px',
                      padding: '6px 12px',
                      letterSpacing: '1.8px',
                      textTransform: 'uppercase',
                    }}>
                      EN ATTENTE DE RÈGLEMENT
                    </div>
                  )}
                  {isPaid && data.modePaiement && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#333333' }}>
                      Mode de règlement : <strong style={{ color: '#000000' }}>{data.modePaiement}</strong>
                    </p>
                  )}
                  {!isPaid && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '10.5px', color: '#666666' }}>
                      Modes acceptés : Cash · NITA · AMANA · VISA
                    </p>
                  )}
                </div>

                {/* Bloc totaux */}
                <div style={{ width: '250px' }}>
                  <div style={{ paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#444444', marginBottom: '6px' }}>
                      <span>Sous-total</span>
                      <span style={{ fontWeight: '600', color: '#000000' }}>{totalFacture.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                    {type === 'reservation' && data.acomptePaye > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#444444', marginBottom: '4px' }}>
                        <span>Acompte versé</span>
                        <span style={{ fontWeight: '600', color: '#000000' }}>– {data.acomptePaye.toLocaleString('fr-FR')} FCFA</span>
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    padding: '11px 14px',
                  }}>
                    <span style={{ fontSize: '10.5px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                      {isPaid ? 'TOTAL PAYÉ' : 'NET À PAYER'}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.5px' }}>
                      {resteAPayer.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                </div>
              </div>

              {/* NOTES (si activées) */}
              {showNotes && type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
                <div style={{
                  marginTop: '24px',
                  padding: '12px 16px',
                  border: '1px solid #e0e0e0',
                  borderLeft: '3px solid #000000',
                  backgroundColor: '#fafafa',
                }}>
                  <p style={{
                    margin: '0 0 6px 0',
                    fontSize: '9px',
                    fontWeight: '800',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: '#000000',
                  }}>
                    Notes &amp; Instructions
                  </p>
                  {data.historiqueNotes.map((note, index) => (
                    <div key={index} style={{ marginBottom: '4px', fontSize: '11px', color: '#333333', lineHeight: '1.5' }}>
                      <strong style={{ color: '#000000' }}>
                        {new Date(note.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')} :
                      </strong>{' '}
                      {note.texte}
                    </div>
                  ))}
                </div>
              )}

              {/* PIED DE PAGE */}
              <div style={{
                marginTop: '32px',
                paddingTop: '16px',
                borderTop: '1px solid #e5e5e5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '10px',
                color: '#666666',
              }}>
                <span>Merci de votre confiance — <strong style={{ color: '#000000' }}>LE CERCLE</strong></span>
                <span><strong style={{ color: '#000000' }}>+227 87 37 73 70</strong> · Niamey, Niger</span>
              </div>
            </div>

            {/* Ligne inférieure noire */}
            <div style={{ height: '4px', backgroundColor: '#000000' }} />

          </div>
          {/* fin facture-print-area */}
        </div>
        {/* fin scroll wrapper */}

        {/* ── Footer Modale Actions ─────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-input)',
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)' }}>
              <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
              Inclure les notes dans le document
            </label>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              className="btn"
              style={{ flex: 1, padding: '11px', fontSize: '0.9rem' }}
            >
              Fermer
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImg}
              className="btn btn-primary"
              style={{ flex: 2, padding: '11px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Image size={17} />
              {isGeneratingImg ? 'Création...' : 'Image JPG'}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="btn btn-primary"
              style={{ flex: 2, padding: '11px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Download size={17} />
              {isGeneratingPdf ? 'Génération...' : 'PDF'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FactureModal;
