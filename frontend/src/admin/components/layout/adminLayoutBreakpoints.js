export const ADMIN_DRAWER_BREAKPOINT = 1024;
export const ADMIN_DRAWER_MEDIA_QUERY = `(max-width: ${ADMIN_DRAWER_BREAKPOINT}px)`;

export function lockDocumentScroll(documentRef) {
  const bodyOverflow = documentRef.body.style.overflow;
  const htmlOverflow = documentRef.documentElement.style.overflow;
  documentRef.body.style.overflow = 'hidden';
  documentRef.documentElement.style.overflow = 'hidden';

  return () => {
    documentRef.body.style.overflow = bodyOverflow;
    documentRef.documentElement.style.overflow = htmlOverflow;
  };
}

export function adminDrawerReducer(state, action) {
  switch (action.type) {
    case 'toggle':
      return { open: !state.open, pathname: action.pathname };
    case 'open':
      return { open: true, pathname: action.pathname };
    case 'close':
    case 'overlay':
    case 'navigation':
    case 'escape':
      return { open: false, pathname: state.pathname };
    default:
      return state;
  }
}
