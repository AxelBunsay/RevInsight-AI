import { useEffect } from 'react';

export const DEFAULT_DOCUMENT_TITLE = "Manoy's Motorcycle Parts, Accessories & Services";

export function setDocumentTitle(title) {
  document.title = title || DEFAULT_DOCUMENT_TITLE;
  return () => {
    document.title = DEFAULT_DOCUMENT_TITLE;
  };
}

export default function useDocumentTitle(title) {
  useEffect(() => setDocumentTitle(title), [title]);
}
