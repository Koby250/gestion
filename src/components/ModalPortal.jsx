import { createPortal } from 'react-dom';

/**
 * ModalPortal — Téléporte la modale directement sur document.body
 * pour garantir qu'elle couvre 100% du viewport (y compris la topbar et la bottom-nav)
 * sans être emprisonnée par les contraintes d'overflow ou de stacking context de main-content.
 */
const ModalPortal = ({ children }) => {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
};

export default ModalPortal;
