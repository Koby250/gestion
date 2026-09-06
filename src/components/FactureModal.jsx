import { useState } from 'react';
import { X, Download, Printer, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const FactureModal = ({ data, type = 'reservation', onClose }) => {
  const [showNotes, setShowNotes] = useState(false);
  // data can be a reservation or a transaction
  
  const isPaid = type === 'transaction' || (type === 'reservation' && (data.statut === 'encaisse' || data.statut === 'paye_totalement'));
  
  const handleDownloadPdf = async () => {
    const element = document.getElementById('facture-content');
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    
    const fileName = type === 'reservation' 
      ? `Facture_Reservation_${data.clientNom || 'Client'}.pdf`
      : `Recu_Caisse_${data.id}.pdf`;
      
    pdf.save(fileName);
  };

  const handlePrint = () => {
    // Le CSS gère déjà l'affichage pour l'impression via @media print
    window.print();
  };

  const dateFormatee = new Date(data.datePrevue || data.date || data.createdAt).toLocaleDateString('fr-FR');
  const heureFormatee = data.heurePrevue || new Date(data.date || data.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalFacture = data.lignes ? data.lignes.reduce((a, l) => a + Number(l.prixFinal || 0), 0) : (data.prixTotal || data.montant || 0);

  return (
    <div className="modal-overlay hide-on-print">
      <div className="modal-content" style={{ maxWidth: '600px', width: '100%', padding: 0 }}>
        
        {/* Header Modal (Non imprimé) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent-color)" /> 
            {type === 'reservation' ? 'Facture de Réservation' : 'Reçu de Caisse'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* CONTENU DE LA FACTURE (Celui qui sera converti en PDF/Imprimé) */}
        <div id="facture-content" className="print-area" style={{ padding: '40px', backgroundColor: '#fff', color: '#000' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #eee', paddingBottom: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>BARBER FACTORY</h1>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#555' }}>Salon de Coiffure & Esthétique</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#777' }}>Tél : +227 88 13 10 58 | Niamey, Niger</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '12px', textTransform: 'uppercase' }}>Informations Client</h4>
              <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>{data.clientNom || 'Client Anonyme'}</p>
              {data.clientTel && <p style={{ margin: 0, fontSize: '14px' }}>Tél : {data.clientTel}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '12px', textTransform: 'uppercase' }}>Détails</h4>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}><strong>Date :</strong> {dateFormatee}</p>
              <p style={{ margin: 0, fontSize: '14px' }}><strong>Heure :</strong> {heureFormatee}</p>
              {data.id && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#888' }}>Réf: {data.id.slice(0, 8).toUpperCase()}</p>}
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '10px 0' }}>Prestation / Motif</th>
                  <th style={{ textAlign: 'center', padding: '10px 0' }}>Agent</th>
                  <th style={{ textAlign: 'right', padding: '10px 0' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.lignes && data.lignes.length > 0 ? (
                  // Multi-service format
                  data.lignes.map((ligne, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px 0', fontSize: '14px' }}>
                        {ligne.serviceNom}
                        {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                            Remise : {ligne.remiseMotif}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'center', fontSize: '13px', color: '#555' }}>
                        {ligne.agents && ligne.agents.map(a => a.nom).join(', ')}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold' }}>
                        {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                          <div style={{ textDecoration: 'line-through', color: '#aaa', fontSize: '12px', fontWeight: 'normal' }}>
                            {Number(ligne.prixBase).toLocaleString('fr-FR')} FCFA
                          </div>
                        )}
                        {Number(ligne.prixFinal).toLocaleString('fr-FR')} FCFA
                      </td>
                    </tr>
                  ))
                ) : (
                  // Legacy single-service format
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px 0', fontSize: '15px' }}>
                      {data.serviceNom || data.motif || 'Vente'}
                      {data.reductionActive && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                          Remise appliquée : {data.reductionMotif}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '15px 0', textAlign: 'center', fontSize: '14px' }}>{data.employeNom || '-'}</td>
                    <td style={{ padding: '15px 0', textAlign: 'right', fontWeight: 'bold' }}>
                      {data.reductionActive && (
                        <div style={{ textDecoration: 'line-through', color: '#aaa', fontSize: '12px', fontWeight: 'normal' }}>
                          {data.prixOriginal} FCFA
                        </div>
                      )}
                      {data.prixTotal || data.montant} FCFA
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            
            {/* STATUT & PAIEMENT */}
            <div style={{ width: '50%' }}>
              {isPaid ? (
                <div style={{ 
                  display: 'inline-block', padding: '8px 16px', border: '3px solid #10b981', 
                  color: '#10b981', fontWeight: 'bold', fontSize: '18px', transform: 'rotate(-5deg)', letterSpacing: '2px' 
                }}>
                  PAYÉE
                </div>
              ) : (
                <div style={{ 
                  display: 'inline-block', padding: '8px 16px', border: '3px solid #ef4444', 
                  color: '#ef4444', fontWeight: 'bold', fontSize: '16px', letterSpacing: '1px' 
                }}>
                  EN ATTENTE DE PAIEMENT
                </div>
              )}
              
              {!isPaid && (
                <p style={{ fontSize: '11px', color: '#555', marginTop: '15px' }}>
                  Moyens acceptés sur place :<br/>Cash, Nita, Amana, Carte VISA
                </p>
              )}
              {isPaid && (data.modePaiement) && (
                <p style={{ fontSize: '12px', color: '#555', marginTop: '15px' }}>
                  Réglé via : {data.modePaiement}
                </p>
              )}
            </div>

            {/* TOTAUX */}
            <div style={{ width: '50%', textAlign: 'right' }}>
              {type === 'reservation' && data.acomptePaye > 0 && (
                <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}>Acompte versé : {data.acomptePaye} FCFA</p>
              )}
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '2px solid #000' }}>
                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>TOTAL DU : </span>
                <span style={{ fontSize: '22px', fontWeight: '900' }}>
                  {type === 'reservation'
                    ? (data.prixTotal - (data.acomptePaye || 0))
                    : Number(totalFacture).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

          </div>

          {showNotes && type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
            <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fafafa' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', textTransform: 'uppercase', color: '#333' }}>Notes & Instructions</h4>
              {data.historiqueNotes.map((note, index) => (
                <div key={index} style={{ marginBottom: '8px', fontSize: '13px', color: '#555' }}>
                  <span style={{ fontWeight: 'bold', marginRight: '5px' }}>
                    {new Date(note.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')} :
                  </span>
                  {note.texte}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
            Merci de votre confiance. En cas d'empêchement, merci de nous prévenir au plus tôt.
          </div>
        </div>

        {/* Footer Modal Actions (Non imprimé) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)' }}>
          {type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-main)' }}>
              <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
              Afficher les notes de réservation sur la facture
            </label>
          )}
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={onClose} className="btn" style={{ flex: 1, backgroundColor: 'var(--bg-card)' }}>
              Fermer
            </button>
            <button onClick={handlePrint} className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Printer size={18} /> Imprimer
            </button>
            <button onClick={handleDownloadPdf} className="btn btn-success" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Download size={18} /> PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FactureModal;
