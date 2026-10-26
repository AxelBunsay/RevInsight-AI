import { useState } from 'react';

function getProductImageUrl(url, width = 400) {
  if (!url) return '';
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},h_${width},c_fill/`);
}

export default function ProductImage({ src, alt, className, fallback, loading = 'lazy', width = 400 }) {
  const [failedSource, setFailedSource] = useState('');

  if (!src || failedSource === src) return fallback;
  return <img
    className={className}
    src={getProductImageUrl(src, width)}
    alt={alt}
    loading={loading}
    onError={() => setFailedSource(src)}
  />;
}
