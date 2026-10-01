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

  const numFacture = `BCF-${(data.id || '').slice(0, 8).toUpperCase()}`;

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
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
            <FileText size={18} color="var(--accent-color)" />
            {type === 'reservation' ? 'Facture de Réservation' : 'Reçu de Caisse'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* ── Zone scrollable ──────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#d0d0d0', padding: '16px', minHeight: 0 }}>

          {/* ══ FACTURE ══════════════════════════════════════════ */}
          <div
            id="facture-print-area"
            className="print-area"
            style={{
              fontFamily: "'Georgia', 'Times New Roman', serif",
              backgroundColor: '#ffffff',
              color: '#1a1a2e',
              width: '620px',
              margin: '0 auto',
            }}
          >
            {/* Bande dorée top */}
            <div style={{ height: '5px', background: 'linear-gradient(90deg, #f0a500, #e05c00)' }} />

            {/* EN-TÊTE */}
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
              color: '#fff',
              padding: '20px 28px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}>
              <div>
                <img
                  src="/gestion.svg"
                  alt="Gestion"
                  crossOrigin="anonymous"
                  style={{ height: '44px', objectFit: 'contain', display: 'block', marginBottom: '6px' }}
                />
                <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
                  Salon de Coiffure &amp; Esthétique
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.6' }}>
                  Tél : +227 88 13 10 58 · Niamey, Niger
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#f0a500', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {type === 'reservation' ? 'FACTURE' : 'REÇU'}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>N° {numFacture}</p>
                <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>
                  {new Date(data.datePrevue || data.date || data.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>à {heureFormatee}</p>
              </div>
            </div>

            {/* INFOS CLIENT */}
            <div style={{ padding: '14px 28px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', backgroundColor: '#fafafa' }}>
              <div>
                <p style={{ margin: '0 0 2px 0', fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#f0a500' }}>CLIENT</p>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>{data.clientNom || 'Client Anonyme'}</p>
                {data.clientTel && <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#666' }}>Tél : {data.clientTel}</p>}
              </div>
              {type === 'reservation' && data.datePrevue && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: '0 0 2px 0', fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#f0a500' }}>RDV</p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '600', color: '#1a1a2e' }}>
                    {new Date(data.datePrevue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#666' }}>à {heureFormatee}</p>
                </div>
              )}
            </div>

            {/* TABLEAU PRESTATIONS */}
            <div style={{ padding: '14px 28px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1a1a2e' }}>
                    <th style={{ padding: '8px 10px', color: '#f0a500', fontSize: '9px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left' }}>Prestation</th>
                    <th style={{ padding: '8px 10px', color: '#f0a500', fontSize: '9px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'center' }}>Agent</th>
                    <th style={{ padding: '8px 10px', color: '#f0a500', fontSize: '9px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'right' }}>Base</th>
                    <th style={{ padding: '8px 10px', color: '#f0a500', fontSize: '9px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lignes && data.lignes.length > 0 ? (
                    data.lignes.map((ligne, index) => (
                      <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f8f8f8', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '9px 10px', fontSize: '12px' }}>
                          <strong>{ligne.serviceNom}</strong>
                          {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                            <div style={{ fontSize: '10px', color: '#f0a500', marginTop: '2px' }}>Remise : {ligne.remiseMotif}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: '11px', color: '#555' }}>
                          {ligne.agents && ligne.agents.map(a => a.nom).join(', ')}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#999' }}>
                          {ligne.remiseType && ligne.remiseType !== 'aucune' ? (
                            <span style={{ textDecoration: 'line-through' }}>{Number(ligne.prixBase).toLocaleString('fr-FR')} F</span>
                          ) : `${Number(ligne.prixBase).toLocaleString('fr-FR')} F`}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>
                          {Number(ligne.prixFinal).toLocaleString('fr-FR')} FCFA
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '9px 10px', fontSize: '12px' }}>
                        <strong>{data.serviceNom || data.motif || 'Vente'}</strong>
                        {data.reductionActive && <div style={{ fontSize: '10px', color: '#f0a500', marginTop: '2px' }}>Remise : {data.reductionMotif}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: '11px', color: '#555' }}>{data.employeNom || '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#999' }}>
                        {data.reductionActive ? <span style={{ textDecoration: 'line-through' }}>{data.prixOriginal} F</span> : `${data.prixTotal || data.montant || 0} F`}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>
                        {(data.prixTotal || data.montant || 0).toLocaleString('fr-FR')} FCFA
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* TOTAUX + STATUT */}
            <div style={{ padding: '0 28px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>

              {/* Tampon statut */}
              <div>
                {isPaid ? (
                  <div style={{ display: 'inline-block', border: '3px solid #10b981', color: '#10b981', fontWeight: '900', fontSize: '17px', padding: '6px 14px', letterSpacing: '3px', transform: 'rotate(-5deg)', borderRadius: '4px' }}>
                    PAYÉE
                  </div>
                ) : (
                  <div style={{ display: 'inline-block', border: '3px solid #ef4444', color: '#ef4444', fontWeight: '900', fontSize: '12px', padding: '6px 12px', letterSpacing: '2px', borderRadius: '4px' }}>
                    EN ATTENTE DE PAIEMENT
                  </div>
                )}
                {isPaid && data.modePaiement && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '10px', color: '#10b981' }}>Réglé via : <strong>{data.modePaiement}</strong></p>
                )}
                {!isPaid && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '10px', color: '#888' }}>Acceptés : Cash · NITA · AMANA · VISA</p>
                )}
              </div>

              {/* Bloc totaux */}
              <div style={{ width: '230px' }}>
                <div style={{ borderTop: '1px solid #ddd', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginBottom: '5px' }}>
                    <span>Sous-total</span>
                    <span>{totalFacture.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  {type === 'reservation' && data.acomptePaye > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#10b981', marginBottom: '5px' }}>
                      <span>Acompte versé</span>
                      <span>– {data.acomptePaye.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a2e', padding: '10px 12px', borderRadius: '6px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#f0a500', letterSpacing: '1px' }}>TOTAL DÛ</span>
                  <span style={{ fontSize: '17px', fontWeight: '900', color: '#fff' }}>{resteAPayer.toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div style={{ textAlign: 'right', marginTop: '6px' }}>
                  <p style={{ margin: 0, fontSize: '9px', color: '#bbb' }}>Réf. {numFacture}</p>
                </div>
              </div>
            </div>

            {/* NOTES (si activées) */}
            {showNotes && type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
              <div style={{ margin: '0 28px 14px', padding: '12px 14px', border: '1px solid #e8e8e8', borderLeft: '4px solid #f0a500', borderRadius: '4px', backgroundColor: '#fffdf5' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#f0a500' }}>
                  Notes &amp; Instructions
                </p>
                {data.historiqueNotes.map((note, index) => (
                  <div key={index} style={{ marginBottom: '5px', fontSize: '11px', color: '#555', lineHeight: '1.5' }}>
                    <strong style={{ color: '#333' }}>
                      {new Date(note.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')} :
                    </strong>{' '}
                    {note.texte}
                  </div>
                ))}
              </div>
            )}

            {/* PIED DE PAGE */}
            <div style={{ backgroundColor: '#f8f8f8', borderTop: '3px solid #f0a500', padding: '12px 28px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '10px', color: '#888', lineHeight: '1.6' }}>
                Merci de votre confiance et à bientôt sur Gestion !<br />
                <strong>+227 88 13 10 58</strong> · Niamey, Niger
              </p>
            </div>

            {/* Bande dorée bas */}
            <div style={{ height: '5px', background: 'linear-gradient(90deg, #f0a500, #e05c00)' }} />

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
              className="btn btn-success"
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
