import { useState } from 'react';
import {
  X, Download, Image, FileText, Printer, Share2,
  Calendar, Clock, User, Phone, Sparkles, CheckCircle2, ArrowRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * FactureModal — Affichage, génération PDF & Image, et partage WhatsApp
 * pour les Factures Prestige (A4) et Reçus de Caisse Ticket (80mm).
 * Entièrement responsive sur mobile et desktop avec moteur de rendu de capture isolé.
 */
const FactureModal = ({ data, type = 'reservation', clients = [], onClose }) => {
  const [docFormat, setDocFormat] = useState('prestige'); // 'prestige' | 'ticket'
  const [showNotes, setShowNotes] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);

  // Détection du statut de paiement
  const isPaid =
    type === 'transaction' ||
    (type === 'reservation' &&
      (data.statut === 'encaisse' || data.statut === 'paye_totalement'));

  const isAcompte =
    type === 'reservation' &&
    data.statut === 'acompte_verse' &&
    Number(data.acomptePaye || 0) > 0;

  // Résolution intelligente du numéro de téléphone client
  const clientFound = clients && clients.length > 0
    ? clients.find(c =>
        (data.clientId && c.id === data.clientId) ||
        [c.prenom, c.nom].filter(Boolean).join(' ').toLowerCase().trim() === (data.clientNom || '').toLowerCase().trim() ||
        (c.nom || '').toLowerCase().trim() === (data.clientNom || '').toLowerCase().trim()
      )
    : null;

  const clientPhone = data.clientTel || clientFound?.telephone || '';

  // Dates et heures formatées
  const dateObj = new Date(data.datePrevue || data.date || data.createdAt || 0);
  const dateFormatee = dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const heureFormatee =
    data.heurePrevue ||
    dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

  // Totaux financiers
  const totalFacture = data.lignes && data.lignes.length > 0
    ? data.lignes.reduce((a, l) => a + Number(l.prixFinal || 0), 0)
    : Number(data.prixTotal || data.montant || 0);

  // Calcul du sous-total brut de base et des remises éventuelles
  let totalBaseBrut = 0;
  let totalRemises = 0;

  if (data.lignes && data.lignes.length > 0) {
    data.lignes.forEach(l => {
      const base = Number(l.prixBase) || Number(l.prixFinal) || 0;
      const finalPrice = Number(l.prixFinal) || 0;
      totalBaseBrut += base;
      if (base > finalPrice) {
        totalRemises += (base - finalPrice);
      }
    });
  } else if (data.prixOriginal && Number(data.prixOriginal) > totalFacture) {
    totalBaseBrut = Number(data.prixOriginal);
    totalRemises = totalBaseBrut - totalFacture;
  } else {
    totalBaseBrut = totalFacture;
  }

  const acomptePaye = Number(data.acomptePaye || 0);
  const resteAPayer = type === 'reservation'
    ? Math.max(0, totalFacture - acomptePaye)
    : 0;

  const numDoc = `LC-${(data.id || '').slice(0, 8).toUpperCase()}`;

  // Détermination du libellé du document
  const getDocTitle = () => {
    if (type === 'reservation') {
      if (isPaid) return 'FACTURE ACQUITTÉE';
      if (isAcompte) return 'FACTURE AVEC ACOMPTE';
      return 'FACTURE DE RÉSERVATION';
    }
    return 'REÇU DE PAIEMENT';
  };

  /**
   * Moteur de capture haute résolution isolé hors écran.
   * Clône le document avec sa largeur de référence réelle (760px pour A4, 380px pour ticket)
   * afin de garantir que sur mobile (iPhone/Android), aucun élément ni colonne ne soit tronqué.
   */
  const captureCanvas = async (forcedFormat = docFormat) => {
    const isTicket = forcedFormat === 'ticket';
    const targetWidth = isTicket ? 380 : 760;

    const source = document.getElementById('facture-print-area');
    if (!source) throw new Error("Document introuvable");

    // Cloner l'élément dans le DOM pour le rendre à sa résolution maîtresse
    const clone = source.cloneNode(true);
    clone.id = 'facture-render-clone';

    // Styliser le clone avec les dimensions fixes A4 / Ticket
    clone.style.width = `${targetWidth}px`;
    clone.style.minWidth = `${targetWidth}px`;
    clone.style.maxWidth = `${targetWidth}px`;
    clone.style.boxSizing = 'border-box';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.borderRadius = '0';
    clone.style.transform = 'none';
    clone.style.overflow = 'visible';
    clone.style.backgroundColor = '#FFFFFF';

    // Rendre visibles tous les conteneurs scrollables du clone
    const scrollContainers = clone.querySelectorAll('[style*="overflow"]');
    scrollContainers.forEach(el => {
      el.style.overflow = 'visible';
      el.style.maxWidth = 'none';
    });

    // Supprimer les aides visuelles réservées à l'écran mobile
    const screenOnly = clone.querySelectorAll('.hide-on-export');
    screenOnly.forEach(el => el.remove());

    // Si format prestige, rétablir la mise en page côte-à-côte A4
    if (!isTicket) {
      const headerFlex = clone.querySelector('.facture-header-flex');
      if (headerFlex) {
        headerFlex.style.flexDirection = 'row';
        headerFlex.style.justifyContent = 'space-between';
        headerFlex.style.alignItems = 'flex-start';
      }
      const headerBadge = clone.querySelector('.facture-header-badge');
      if (headerBadge) {
        headerBadge.style.width = 'auto';
        headerBadge.style.textAlign = 'right';
        headerBadge.style.borderTop = 'none';
        headerBadge.style.paddingTop = '0';
      }
      const bentoGrid = clone.querySelector('.facture-bento-grid');
      if (bentoGrid) {
        bentoGrid.style.gridTemplateColumns = '1fr 1fr';
        bentoGrid.style.gap = '14px';
      }
      const tableWrapper = clone.querySelector('.facture-table-wrapper');
      if (tableWrapper) {
        tableWrapper.style.overflow = 'visible';
        tableWrapper.style.width = '100%';
        tableWrapper.style.minWidth = '100%';
      }
      const table = clone.querySelector('.facture-table');
      if (table) {
        table.style.width = '100%';
        table.style.minWidth = '100%';
        table.style.tableLayout = 'auto';
      }
      const totalsFlex = clone.querySelector('.facture-totals-flex');
      if (totalsFlex) {
        totalsFlex.style.flexDirection = 'row';
        totalsFlex.style.justifyContent = 'space-between';
        totalsFlex.style.alignItems = 'flex-end';
      }
      const innerCard = clone.querySelector('.facture-inner-card');
      if (innerCard) {
        innerCard.style.padding = '34px 38px 28px';
      }
    }

    // Conteneur temporaire isolé hors de l'écran visible
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-10000px';
    wrapper.style.top = '0';
    wrapper.style.width = `${targetWidth}px`;
    wrapper.style.zIndex = '-9999';
    wrapper.style.backgroundColor = '#FFFFFF';
    wrapper.style.opacity = '1';
    wrapper.style.pointerEvents = 'none';

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      if (document.fonts) {
        await document.fonts.ready;
      }
      const imgs = Array.from(clone.getElementsByTagName('img'));
      await Promise.all(
        imgs.map(img => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          return new Promise(res => {
            img.onload = res;
            img.onerror = res;
            setTimeout(res, 200);
          });
        })
      );
      await new Promise(r => setTimeout(r, 80));

      const canvas = await html2canvas(clone, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: false,
        width: targetWidth,
        height: clone.scrollHeight,
        windowWidth: targetWidth,
        windowHeight: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0
      });

      return canvas;
    } finally {
      document.body.removeChild(wrapper);
    }
  };

  // Téléchargement PDF A4 ou Reçu Thermique 80mm
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const fileName = type === 'reservation'
        ? `Facture_${(data.clientNom || 'Client').replace(/\s+/g, '_')}_${numDoc}.pdf`
        : `Recu_${(data.clientNom || 'Client').replace(/\s+/g, '_')}_${numDoc}.pdf`;

      if (docFormat === 'ticket') {
        // FORMAT TICKET 80mm : Idéal imprimantes de caisse & visualisation smartphone plein écran
        const ticketWidthMm = 80;
        const ticketHeightMm = (canvas.height * ticketWidthMm) / canvas.width;
        const pdf = new jsPDF('p', 'mm', [ticketWidthMm, Math.max(90, Math.ceil(ticketHeightMm) + 6)]);
        pdf.addImage(imgData, 'JPEG', 0, 3, ticketWidthMm, ticketHeightMm);
        pdf.save(fileName);
      } else {
        // FORMAT PRESTIGE A4 OFFICIEL : ajustement plein cadre sans bandes latérales vides
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();   // 210 mm
        const pageHeight = pdf.internal.pageSize.getHeight(); // 297 mm
        const marginX = 10;
        const printableWidth = pageWidth - (marginX * 2);      // 190 mm
        const printableHeight = (canvas.height * printableWidth) / canvas.width;

        if (printableHeight <= pageHeight - 20) {
          // Centrage vertical équilibré sur la page A4
          const yOffset = Math.max(10, (pageHeight - printableHeight) / 2);
          pdf.addImage(imgData, 'JPEG', marginX, yOffset, printableWidth, printableHeight);
        } else {
          // Adaptation proportionnelle pour document à forte densité de prestations
          const scale = (pageHeight - 20) / printableHeight;
          const scaledW = printableWidth * scale;
          const xOffset = marginX + (printableWidth - scaledW) / 2;
          pdf.addImage(imgData, 'JPEG', xOffset, 10, scaledW, pageHeight - 20);
        }
        pdf.save(fileName);
      }
    } catch (err) {
      console.error('Erreur PDF:', err);
      alert('Une erreur est survenue lors de la création du PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Téléchargement Image JPEG haute fidélité
  const handleDownloadImage = async () => {
    setIsGeneratingImg(true);
    try {
      const canvas = await captureCanvas();
      const link = document.createElement('a');
      link.download = type === 'reservation'
        ? `Facture_${(data.clientNom || 'Client').replace(/\s+/g, '_')}_${numDoc}.jpg`
        : `Recu_${(data.clientNom || 'Client').replace(/\s+/g, '_')}_${numDoc}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      console.error('Erreur Image:', err);
      alert("Une erreur est survenue lors de l'export en image.");
    } finally {
      setIsGeneratingImg(false);
    }
  };

  // Impression directe du document
  const handlePrint = () => {
    window.print();
  };

  // Partage instantané du reçu sur WhatsApp avec texte de synthèse haute facture
  const handleShareWhatsApp = () => {
    const totalStr = Number(totalFacture).toLocaleString('fr-FR');
    const servicesList = data.lignes && data.lignes.length > 0
      ? data.lignes.map(l => {
          const isBillard = !!(l.isBillard || l.serviceId === 'billard' || l.categorieService === 'loisirs' || (l.serviceNom || '').toLowerCase().includes('billard'));
          const nbB = Number(l.nombreParties) || 1;
          const label = isBillard ? `Billard (${nbB} partie${nbB > 1 ? 's' : ''})` : l.serviceNom;
          return `• ${label} (${Number(l.prixFinal).toLocaleString('fr-FR')} F)`;
        }).join('\n')
      : `• ${data.serviceNom || data.motif || 'Prestation'} (${totalStr} F)`;

    let statutWhatsApp = `✅ Payé intégralement via ${data.modePaiement || 'Cash'}`;
    if (!isPaid) {
      if (isAcompte) {
        statutWhatsApp = `★ Acompte versé : ${Number(acomptePaye).toLocaleString('fr-FR')} F (Reste : ${Number(resteAPayer).toLocaleString('fr-FR')} F)`;
      } else {
        statutWhatsApp = `⏳ En attente de règlement au salon (${Number(resteAPayer).toLocaleString('fr-FR')} F)`;
      }
    }

    const msg =
`💈 *LE CERCLE — ${getDocTitle()}*
━━━━━━━━━━━━━━━━━━━━━━
📄 *Réf :* ${numDoc}
👤 *Client :* ${data.clientNom || 'Client'}
📅 *Date :* ${dateFormatee} à ${heureFormatee}
${type === 'reservation' && data.datePrevue ? `🗓️ *Rendez-vous :* ${new Date(data.datePrevue).toLocaleDateString('fr-FR')} à ${data.heurePrevue}\n` : ''}
*Détail des soins :*
${servicesList}

━━━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL : ${totalStr} FCFA*
${statutWhatsApp}
━━━━━━━━━━━━━━━━━━━━━━
✨ _Merci pour votre confiance !_
📍 Niamey, Niger
📞 +227 87 37 73 70`;

    const cleanPhone = clientPhone ? clientPhone.replace(/[\s.()-]/g, '') : '';
    const normalizedPhone = cleanPhone.startsWith('+')
      ? cleanPhone.slice(1)
      : cleanPhone.startsWith('00')
        ? cleanPhone.slice(2)
        : (cleanPhone.length === 8 ? `227${cleanPhone}` : cleanPhone);

    const waUrl = cleanPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank');
  };

  return (
    <div className="modal-overlay hide-on-print">
      {/* Styles d'adaptation responsive intégrés */}
      <style>{`
        @media (max-width: 640px) {
          .facture-inner-card {
            padding: 18px 14px 16px !important;
          }
          .facture-header-flex {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .facture-header-badge {
            width: 100% !important;
            text-align: left !important;
            padding-top: 10px !important;
            border-top: 1px dashed #E2E8F0 !important;
          }
          .facture-bento-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
            margin: 14px 0 !important;
          }
          .facture-totals-flex {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 14px !important;
          }
          .facture-totals-box {
            width: 100% !important;
          }
          .facture-stamp-box {
            width: 100% !important;
            text-align: center !important;
          }
          .facture-action-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .mobile-scroll-hint {
            display: flex !important;
          }
        }
        @media (min-width: 641px) {
          .mobile-scroll-hint {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="modal-content"
        style={{
          maxWidth: '820px',
          width: '96vw',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          background: 'var(--bg-card)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── BARRE D'EN-TÊTE MODALE (Sélecteur de format & Actions rapides) ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            flexShrink: 0,
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#D97706',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FileText size={19} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                {type === 'reservation' ? 'Facture & Reçu de Réservation' : 'Reçu de Caisse Officiel'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Réf : {numDoc} • {data.clientNom || 'Client'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Toggle de Format : Facture A4 Prestige vs Ticket de Caisse */}
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--bg-input)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)'
            }}>
              <button
                type="button"
                onClick={() => setDocFormat('prestige')}
                style={{
                  padding: '6px 11px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: docFormat === 'prestige' ? 'var(--btn-primary-bg)' : 'transparent',
                  color: docFormat === 'prestige' ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>📄</span> Facture A4
              </button>
              <button
                type="button"
                onClick={() => setDocFormat('ticket')}
                style={{
                  padding: '6px 11px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: docFormat === 'ticket' ? 'var(--btn-primary-bg)' : 'transparent',
                  color: docFormat === 'ticket' ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🧾</span> Reçu Ticket
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
              title="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── ZONE DE DÉFILEMENT DU DOCUMENT ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          backgroundColor: '#0c0d0e',
          padding: '20px 12px',
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          WebkitOverflowScrolling: 'touch'
        }}>

          {/* ════════════════════════════════════════════════════════════════
              DOCUMENT PRIMAIRE IMPRIMABLE (#facture-print-area)
              Construit sur fond 100% BLANC pur, typographie soignée,
              logo noir officiel Le Cercle et finitions dorées.
              ════════════════════════════════════════════════════════════════ */}
          <div
            id="facture-print-area"
            className="print-area"
            style={{
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              width: '100%',
              maxWidth: docFormat === 'ticket' ? '390px' : '720px',
              margin: '0 auto',
              boxSizing: 'border-box',
              borderRadius: docFormat === 'ticket' ? '12px' : '16px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              border: '1px solid #E2E8F0',
              WebkitFontSmoothing: 'antialiased'
            }}
          >

            {/* ────────────────────────────────────────────────────────────
                FORMAT 1 : FACTURE PRESTIGE (Présentation A4 Haute Couture)
               ──────────────────────────────────────────────────────────── */}
            {docFormat === 'prestige' && (
              <div>
                {/* Ruban supérieur bicolore Noir & Or */}
                <div style={{ display: 'flex', height: '6px', width: '100%' }}>
                  <div style={{ flex: 3, backgroundColor: '#0F172A' }} />
                  <div style={{ flex: 1, backgroundColor: '#D97706' }} />
                  <div style={{ flex: 1, backgroundColor: '#B45309' }} />
                </div>

                <div className="facture-inner-card" style={{ padding: '30px 32px 26px' }}>
                  {/* EN-TÊTE DU SALON & DOCUMENT */}
                  <div
                    className="facture-header-flex"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      paddingBottom: '20px',
                      borderBottom: '1px solid #E2E8F0',
                      gap: '16px'
                    }}
                  >
                    {/* Logo & Identité Salon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <img
                        src="/logos/noir.png"
                        alt="Logo Le Cercle"
                        crossOrigin="anonymous"
                        style={{
                          height: '54px',
                          width: '54px',
                          borderRadius: '50%',
                          objectFit: 'contain',
                          display: 'block',
                          flexShrink: 0,
                          border: '2px solid #D97706',
                          padding: '2px',
                          backgroundColor: '#FFFFFF'
                        }}
                      />
                      <div>
                        <div style={{
                          fontSize: '22px',
                          fontWeight: '900',
                          letterSpacing: '3px',
                          color: '#0F172A',
                          textTransform: 'uppercase',
                          lineHeight: '1.1'
                        }}>
                          LE CERCLE
                        </div>
                        <div style={{
                          margin: '3px 0 0 0',
                          fontSize: '9.5px',
                          fontWeight: '800',
                          letterSpacing: '2px',
                          color: '#B45309',
                          textTransform: 'uppercase'
                        }}>
                          Salon de Coiffure &amp; Lounge VIP
                        </div>
                        <div style={{
                          margin: '3px 0 0 0',
                          fontSize: '11px',
                          color: '#64748B',
                          fontStyle: 'italic'
                        }}>
                          Espace &amp; Services de Prestige
                        </div>
                        <div style={{
                          margin: '4px 0 0 0',
                          fontSize: '11px',
                          color: '#334155',
                          fontWeight: '600'
                        }}>
                          📍 Niamey, Niger &nbsp;•&nbsp; 📞 +227 87 37 73 70
                        </div>
                      </div>
                    </div>

                    {/* Titre & Numéro de Pièce */}
                    <div className="facture-header-badge" style={{ textAlign: 'right' }}>
                      <div style={{
                        display: 'inline-block',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        border: '1.5px solid #D97706',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        letterSpacing: '1.8px',
                        textTransform: 'uppercase',
                        lineHeight: 1
                      }}>
                        {getDocTitle()}
                      </div>
                      <div style={{
                        margin: '7px 0 0 0',
                        fontSize: '13.5px',
                        fontWeight: '900',
                        color: '#0F172A',
                        letterSpacing: '0.8px'
                      }}>
                        N° {numDoc}
                      </div>
                      <div style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                        Émis le {dateFormatee} à {heureFormatee}
                      </div>
                    </div>
                  </div>

                  {/* BENTO : INFORMATIONS CLIENT & RÈGLEMENT */}
                  <div
                    className="facture-bento-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      margin: '18px 0'
                    }}
                  >
                    {/* Carte Client */}
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '13px 15px'
                    }}>
                      <div style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        letterSpacing: '1.8px',
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <User size={12} color="#D97706" /> FACTURÉ À
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', lineHeight: 1.2 }}>
                        {data.clientNom || 'Client Anonyme'}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '5px',
                        fontSize: '11.5px',
                        color: '#475569',
                        fontWeight: '600'
                      }}>
                        <Phone size={12} color="#64748B" />
                        {clientPhone || 'Numéro non renseigné'}
                      </div>

                      {data.promotionNom && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          marginTop: '8px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          fontSize: '10px',
                          fontWeight: '700',
                          color: '#B45309'
                        }}>
                          <Sparkles size={11} color="#D97706" /> Offre : {data.promotionNom}
                        </div>
                      )}
                    </div>

                    {/* Carte Informations Règlement & Rendez-vous */}
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '13px 15px'
                    }}>
                      <div style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        letterSpacing: '1.8px',
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <Calendar size={12} color="#D97706" /> DÉTAILS DE L'OPÉRATION
                      </div>

                      {type === 'reservation' && data.datePrevue && (
                        <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: '700', marginBottom: '5px' }}>
                          📅 RDV : <span style={{ color: '#D97706' }}>{new Date(data.datePrevue).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à {data.heurePrevue}</span>
                        </div>
                      )}

                      <div style={{ fontSize: '11.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Règlement :</span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          fontWeight: '700',
                          color: '#0F172A'
                        }}>
                          💳 {data.modePaiement || 'Cash'}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '5px' }}>
                        ✂️ Intervenant : <strong style={{ color: '#334155' }}>{data.employeNom || 'Équipe Le Cercle'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* AIDE VISUELLE SUR MOBILE (DÉFILEMENT HORIZONTAL TABLEAU) */}
                  <div
                    className="mobile-scroll-hint hide-on-export"
                    style={{
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10.5px',
                      color: '#64748B',
                      marginBottom: '6px',
                      padding: '4px 8px',
                      backgroundColor: '#F1F5F9',
                      borderRadius: '6px',
                      fontWeight: 600
                    }}
                  >
                    <span>👉 Faites glisser le tableau pour voir toutes les colonnes</span>
                    <ArrowRight size={12} color="#64748B" />
                  </div>

                  {/* TABLEAU DES PRESTATIONS (AVEC SCROLL HORIZONTAL PROTÉGÉ SUR MOBILE) */}
                  <div
                    className="facture-table-wrapper"
                    style={{
                      marginTop: '12px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      backgroundColor: '#FFFFFF',
                      width: '100%'
                    }}
                  >
                    <table
                      className="facture-table"
                      style={{
                        width: '100%',
                        minWidth: '520px',
                        borderCollapse: 'collapse',
                        fontSize: '12px'
                      }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                          <th style={{ padding: '10px 14px', fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'left', width: '42%' }}>
                            Désignation &amp; Détails
                          </th>
                          <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center', width: '20%' }}>
                            Praticien
                          </th>
                          <th style={{ padding: '10px 12px', fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'right', width: '18%' }}>
                            Tarif Base
                          </th>
                          <th style={{ padding: '10px 14px', fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'right', width: '20%' }}>
                            Total Net
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lignes && data.lignes.length > 0 ? (
                          data.lignes.map((ligne, index) => {
                            const isBillard = !!(ligne.isBillard || ligne.serviceId === 'billard' || ligne.categorieService === 'loisirs' || (ligne.serviceNom || '').toLowerCase().includes('billard'));
                            const nbB = Number(ligne.nombreParties) || 1;
                            const nomAffiche = isBillard
                              ? `${ligne.serviceNom || 'Billard'} (${nbB} partie${nbB > 1 ? 's' : ''})`
                              : (ligne.serviceNom || 'Prestation');
                            const agentAffiche = (ligne.agents && ligne.agents.length > 0)
                              ? ligne.agents.map(a => a.nom).join(', ')
                              : (isBillard ? '—' : (ligne.employeNom || 'Équipe Le Cercle'));

                            const aUneRemise = Number(ligne.prixBase || 0) > Number(ligne.prixFinal || 0);

                            return (
                              <tr
                                key={index}
                                style={{
                                  borderBottom: '1px solid #F1F5F9',
                                  backgroundColor: index % 2 === 1 ? '#FAFAFA' : '#FFFFFF'
                                }}
                              >
                                <td style={{ padding: '11px 14px' }}>
                                  <div style={{ fontWeight: '700', color: '#0F172A', fontSize: '12.5px' }}>
                                    {nomAffiche}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '3px' }}>
                                    {ligne.isDomicile && (
                                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#EDE9FE', color: '#6D28D9', fontWeight: '700' }}>
                                        🏠 À domicile
                                      </span>
                                    )}
                                    {(ligne.promotionNom || (data.promotionNom && ligne.isPromo)) && (
                                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: '700' }}>
                                        🎁 Pack : {ligne.promotionNom || data.promotionNom}
                                      </span>
                                    )}
                                    {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#047857', fontWeight: '600', fontStyle: 'italic' }}>
                                        ✂️ Remise : {ligne.remiseMotif}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '11px 12px', textAlign: 'center', fontSize: '11.5px', color: '#475569' }}>
                                  {agentAffiche}
                                </td>
                                <td style={{ padding: '11px 12px', textAlign: 'right', fontSize: '11.5px', color: '#64748B' }}>
                                  {aUneRemise ? (
                                    <span style={{ textDecoration: 'line-through', color: '#94A3B8' }}>
                                      {Number(ligne.prixBase).toLocaleString('fr-FR')} F
                                    </span>
                                  ) : (
                                    `${Number(ligne.prixBase || ligne.prixFinal).toLocaleString('fr-FR')} F`
                                  )}
                                </td>
                                <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: '800', color: '#0F172A' }}>
                                  {Number(ligne.prixFinal).toLocaleString('fr-FR')} FCFA
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr style={{ backgroundColor: '#FFFFFF' }}>
                            <td style={{ padding: '13px 14px' }}>
                              <div style={{ fontWeight: '700', color: '#0F172A', fontSize: '12.5px' }}>
                                {data.serviceNom || data.motif || 'Prestation'}
                              </div>
                              {data.reductionActive && (
                                <div style={{ fontSize: '9.5px', color: '#047857', fontStyle: 'italic', marginTop: '2px' }}>
                                  ✂️ Remise : {data.reductionMotif}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11.5px', color: '#475569' }}>
                              {data.employeNom || 'Équipe Le Cercle'}
                            </td>
                            <td style={{ padding: '13px 12px', textAlign: 'right', fontSize: '11.5px', color: '#64748B' }}>
                              {data.reductionActive ? (
                                <span style={{ textDecoration: 'line-through', color: '#94A3B8' }}>{data.prixOriginal} F</span>
                              ) : `${Number(data.prixTotal || data.montant || 0).toLocaleString('fr-FR')} F`}
                            </td>
                            <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: '12.5px', fontWeight: '800', color: '#0F172A' }}>
                              {Number(data.prixTotal || data.montant || 0).toLocaleString('fr-FR')} FCFA
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* TOTAUX FINANCIERS + TAMPON OFFICIEL NUMÉRIQUE */}
                  <div
                    className="facture-totals-flex"
                    style={{
                      marginTop: '20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                      flexWrap: 'wrap',
                      gap: '16px'
                    }}
                  >
                    {/* TAMPON OFFICIEL NUMÉRIQUE CERTIFIÉ */}
                    <div className="facture-stamp-box" style={{ minWidth: '200px' }}>
                      {isPaid ? (
                        <div style={{
                          display: 'inline-block',
                          border: '2px solid #059669',
                          outline: '1.5px dashed #10B981',
                          outlineOffset: '2px',
                          borderRadius: '10px',
                          padding: '10px 15px',
                          backgroundColor: '#F0FDF4',
                          color: '#047857',
                          transform: 'rotate(-1.5deg)',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)'
                        }}>
                          <div style={{ fontSize: '10.5px', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CheckCircle2 size={13} color="#059669" /> CERTIFIÉ PAYÉ
                          </div>
                          <div style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '1px', marginTop: '2px', color: '#065F46' }}>
                            LE CERCLE NIAMEY
                          </div>
                          <div style={{ fontSize: '8.5px', marginTop: '2px', color: '#047857' }}>
                            Mode : {data.modePaiement || 'Cash'} • {dateFormatee}
                          </div>
                        </div>
                      ) : isAcompte ? (
                        <div style={{
                          display: 'inline-block',
                          border: '2px solid #D97706',
                          outline: '1.5px dashed #F59E0B',
                          outlineOffset: '2px',
                          borderRadius: '10px',
                          padding: '10px 15px',
                          backgroundColor: '#FFFBEB',
                          color: '#B45309',
                          transform: 'rotate(-1.5deg)'
                        }}>
                          <div style={{ fontSize: '10.5px', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase' }}>
                            ★ ACOMPTE VERSÉ ★
                          </div>
                          <div style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '1px', marginTop: '2px', color: '#92400E' }}>
                            LE CERCLE NIAMEY
                          </div>
                          <div style={{ fontSize: '8.5px', marginTop: '2px', color: '#B45309' }}>
                            Reste dû : {resteAPayer.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-block',
                          border: '1.5px dashed #64748B',
                          borderRadius: '10px',
                          padding: '8px 14px',
                          backgroundColor: '#F8FAFC',
                          color: '#475569'
                        }}>
                          <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={12} color="#64748B" /> EN ATTENTE DE RÈGLEMENT
                          </div>
                          <div style={{ fontSize: '8.5px', color: '#64748B', marginTop: '2px' }}>
                            Modes acceptés : Cash • VISA • NITA • AMANA
                          </div>
                        </div>
                      )}
                    </div>

                    {/* BLOC RÉCAPITULATIF DES TOTAUX */}
                    <div className="facture-totals-box" style={{ width: '270px' }}>
                      <div style={{ paddingBottom: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
                          <span>Sous-total brut</span>
                          <span style={{ fontWeight: '600', color: '#0F172A' }}>
                            {totalBaseBrut.toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>

                        {totalRemises > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#059669', fontWeight: '700' }}>
                            <span>Remise accordée</span>
                            <span>– {totalRemises.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                        )}

                        {type === 'reservation' && acomptePaye > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#0F172A', fontWeight: '600' }}>
                            <span>Acompte déjà versé</span>
                            <span>– {acomptePaye.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                        )}

                        {type === 'reservation' && !isPaid && resteAPayer > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#D97706', fontWeight: '700' }}>
                            <span>Solde restant dû</span>
                            <span>{resteAPayer.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                        )}
                      </div>

                      {/* BANNIÈRE DE MONTANT PRINCIPAL */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '11px 15px',
                        borderRadius: '10px',
                        borderLeft: '4px solid #D97706',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
                      }}>
                        <span style={{ fontSize: '9.5px', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', color: '#CBD5E1' }}>
                          {isPaid ? 'TOTAL PAYÉ' : (resteAPayer > 0 && acomptePaye > 0 ? 'NET RESTANT' : 'NET À PAYER')}
                        </span>
                        <span style={{ fontSize: '17px', fontWeight: '900', letterSpacing: '0.5px', color: '#FFFFFF' }}>
                          {(isPaid ? totalFacture : (resteAPayer > 0 ? resteAPayer : totalFacture)).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* NOTES CLIENTS & CONSIGNES PARTICULIÈRES (Optionnel) */}
                  {showNotes && type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
                    <div style={{
                      marginTop: '20px',
                      padding: '12px 15px',
                      border: '1px solid #FEF3C7',
                      borderLeft: '3px solid #D97706',
                      borderRadius: '8px',
                      backgroundColor: '#FFFBEB'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#92400E', marginBottom: '4px' }}>
                        Notes &amp; Instructions relatives au rendez-vous
                      </div>
                      {data.historiqueNotes.map((note, index) => (
                        <div key={index} style={{ fontSize: '11px', color: '#78350F', lineHeight: '1.4' }}>
                          • <strong>{new Date(note.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' à')} :</strong> {note.texte}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PIED DE PAGE HAUTE SÉCURITÉ & CONTACTS */}
                  <div style={{
                    marginTop: '24px',
                    paddingTop: '14px',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {/* Faux Code-barres de certification esthétique */}
                    <div style={{ textAlign: 'center' }}>
                      <svg width="220" height="26" viewBox="0 0 220 26" style={{ display: 'block', margin: '0 auto', opacity: 0.85 }}>
                        {[3, 1, 4, 1, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 4].map((w, i) => (
                          <rect key={i} x={i * 5.2} y="0" width={w} height="22" fill="#0F172A" />
                        ))}
                      </svg>
                      <div style={{ fontSize: '8px', letterSpacing: '2.5px', color: '#64748B', fontWeight: '700', marginTop: '2px', textTransform: 'uppercase' }}>
                        DOC-ID : {numDoc}-LE-CERCLE-NIAMEY-OFFICIAL
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '10px',
                      color: '#64748B',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginTop: '3px'
                    }}>
                      <span>Merci de votre fidélité — <strong style={{ color: '#0F172A' }}>LE CERCLE VIP</strong></span>
                      <span><strong style={{ color: '#0F172A' }}>+227 87 37 73 70</strong> &nbsp;•&nbsp; Niamey, Niger &nbsp;•&nbsp; 7j/7</span>
                    </div>
                  </div>
                </div>

                {/* Ligne inférieure de finition */}
                <div style={{ height: '4px', backgroundColor: '#0F172A' }} />
              </div>
            )}

            {/* ────────────────────────────────────────────────────────────
                FORMAT 2 : TICKET DE CAISSE COMPACT (Format Reçu 80mm)
               ──────────────────────────────────────────────────────────── */}
            {docFormat === 'ticket' && (
              <div style={{ padding: '22px 20px' }}>
                {/* Ruban haut discret */}
                <div style={{ height: '4px', backgroundColor: '#D97706', margin: '-22px -20px 16px -20px' }} />

                {/* En-tête centré */}
                <div style={{ textAlign: 'center' }}>
                  <img
                    src="/logos/noir.png"
                    alt="Logo Le Cercle"
                    crossOrigin="anonymous"
                    style={{
                      height: '48px',
                      width: '48px',
                      borderRadius: '50%',
                      margin: '0 auto 6px',
                      display: 'block',
                      border: '1.5px solid #D97706',
                      padding: '2px'
                    }}
                  />
                  <div style={{ fontSize: '19px', fontWeight: '900', letterSpacing: '2px', color: '#0F172A' }}>
                    LE CERCLE
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '1.5px', color: '#B45309', textTransform: 'uppercase' }}>
                    Salon de Coiffure &amp; Lounge VIP
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                    Tél : +227 87 37 73 70 • Niamey, Niger
                  </div>
                </div>

                {/* Ligne pointillée */}
                <div style={{ borderBottom: '1.5px dashed #CBD5E1', margin: '12px 0' }} />

                {/* Métadonnées ticket */}
                <div style={{ fontSize: '11px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>TICKET :</span>
                    <strong style={{ color: '#0F172A' }}>{numDoc}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>DATE :</span>
                    <span>{dateFormatee} à {heureFormatee}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>CLIENT :</span>
                    <strong style={{ color: '#0F172A' }}>{data.clientNom || 'Client de passage'}</strong>
                  </div>
                  {clientPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748B' }}>TÉLÉPHONE :</span>
                      <span>{clientPhone}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>OPÉRATEUR :</span>
                    <span>{data.employeNom || 'Équipe Le Cercle'}</span>
                  </div>
                  {data.promotionNom && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B45309', fontWeight: '700' }}>
                      <span>OFFRE PROMO :</span>
                      <span>{data.promotionNom}</span>
                    </div>
                  )}
                </div>

                {/* Ligne pointillée */}
                <div style={{ borderBottom: '1.5px dashed #CBD5E1', margin: '12px 0' }} />

                {/* Liste des prestations du ticket */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px' }}>
                  {data.lignes && data.lignes.length > 0 ? (
                    data.lignes.map((ligne, idx) => {
                      const isBillard = !!(ligne.isBillard || ligne.serviceId === 'billard' || ligne.categorieService === 'loisirs' || (ligne.serviceNom || '').toLowerCase().includes('billard'));
                      const nbB = Number(ligne.nombreParties) || 1;
                      const nomAffiche = isBillard
                        ? `${ligne.serviceNom || 'Billard'} (${nbB}p)`
                        : (ligne.serviceNom || 'Prestation');

                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, paddingRight: '10px' }}>
                            <div style={{ fontWeight: '700', color: '#0F172A' }}>
                              {idx + 1}. {nomAffiche}
                            </div>
                            {ligne.remiseType && ligne.remiseType !== 'aucune' && (
                              <div style={{ fontSize: '9.5px', color: '#047857' }}>
                                Remise : {ligne.remiseMotif}
                              </div>
                            )}
                          </div>
                          <div style={{ fontWeight: '800', color: '#0F172A' }}>
                            {Number(ligne.prixFinal).toLocaleString('fr-FR')} F
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{data.serviceNom || data.motif || 'Prestation'}</span>
                      <strong style={{ color: '#0F172A' }}>{Number(totalFacture).toLocaleString('fr-FR')} F</strong>
                    </div>
                  )}
                </div>

                {/* Ligne pointillée */}
                <div style={{ borderBottom: '1.5px dashed #CBD5E1', margin: '12px 0' }} />

                {/* Totaux & Reste */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>Sous-total :</span>
                    <span>{totalBaseBrut.toLocaleString('fr-FR')} FCFA</span>
                  </div>

                  {totalRemises > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: '700' }}>
                      <span>Remise accordée :</span>
                      <span>– {totalRemises.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  )}

                  {type === 'reservation' && acomptePaye > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0F172A', fontWeight: '700' }}>
                      <span>Acompte versé :</span>
                      <span>– {acomptePaye.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '6px',
                    padding: '8px 10px',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontSize: '10.5px', fontWeight: '900', letterSpacing: '1px' }}>
                      {isPaid ? 'TOTAL PAYÉ' : 'NET À PAYER'}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: '900' }}>
                      {(isPaid ? totalFacture : (resteAPayer > 0 ? resteAPayer : totalFacture)).toLocaleString('fr-FR')} F
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', color: '#475569', fontSize: '10.5px' }}>
                    <span>Mode de règlement :</span>
                    <strong>{data.modePaiement || 'Cash'}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: isPaid ? '#047857' : '#D97706', fontWeight: '800', fontSize: '10.5px' }}>
                    <span>Statut :</span>
                    <span>{isPaid ? '✓ ENCAISSÉ' : (isAcompte ? '★ ACOMPTE PARTIEL' : '⏳ EN ATTENTE')}</span>
                  </div>
                </div>

                {/* Ligne pointillée */}
                <div style={{ borderBottom: '1.5px dashed #CBD5E1', margin: '12px 0' }} />

                {/* Code-barres compact */}
                <div style={{ textAlign: 'center', marginTop: '4px' }}>
                  <svg width="160" height="22" viewBox="0 0 160 22" style={{ display: 'block', margin: '0 auto', opacity: 0.8 }}>
                    {[2, 1, 3, 1, 1, 2, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 1, 2, 1, 4].map((w, i) => (
                      <rect key={i} x={i * 5} y="0" width={w} height="18" fill="#0F172A" />
                    ))}
                  </svg>
                  <div style={{ fontSize: '7.5px', color: '#64748B', fontWeight: '700', letterSpacing: '1.5px', marginTop: '2px' }}>
                    *{numDoc}*
                  </div>
                </div>

                {/* Message de fin */}
                <div style={{ textAlign: 'center', fontSize: '9.5px', color: '#64748B', marginTop: '10px', lineHeight: '1.4' }}>
                  Merci pour votre confiance !<br />
                  <strong style={{ color: '#0F172A' }}>LE CERCLE — L'Excellence au quotidien</strong>
                </div>
              </div>
            )}

          </div>
          {/* Fin #facture-print-area */}
        </div>
        {/* Fin zone scrollable */}

        {/* ── BARRE D'ACTIONS INFÉRIEURE (Téléchargements, WhatsApp & Print) ── */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-input)',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {type === 'reservation' && data.historiqueNotes && data.historiqueNotes.length > 0 && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'var(--text-main)',
              fontWeight: 600
            }}>
              <input
                type="checkbox"
                checked={showNotes}
                onChange={(e) => setShowNotes(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              Inclure l'historique des notes et consignes sur le document
            </label>
          )}

          <div
            className="facture-action-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
              gap: '8px'
            }}
          >
            {/* Partage WhatsApp */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="btn"
              style={{
                backgroundColor: '#25D366',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '8px'
              }}
              title="Envoyer le récapitulatif du reçu directement au client sur WhatsApp"
            >
              <Share2 size={15} /> WhatsApp
            </button>

            {/* Impression directe */}
            <button
              type="button"
              onClick={handlePrint}
              className="btn"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '8px'
              }}
              title="Lancer l'impression directe (imprimante de caisse ou de bureau)"
            >
              <Printer size={15} /> Imprimer
            </button>

            {/* Télécharger Image JPG */}
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isGeneratingImg}
              className="btn btn-primary"
              style={{
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '8px'
              }}
              title="Télécharger l'image JPEG haute définition du reçu"
            >
              <Image size={15} /> {isGeneratingImg ? 'Création...' : 'Image JPG'}
            </button>

            {/* Télécharger PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="btn btn-primary"
              style={{
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 10px',
                borderRadius: '8px'
              }}
              title="Générer un PDF officiel téléchargeable"
            >
              <Download size={15} /> {isGeneratingPdf ? 'PDF...' : (docFormat === 'ticket' ? 'PDF Ticket' : 'PDF A4')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FactureModal;
