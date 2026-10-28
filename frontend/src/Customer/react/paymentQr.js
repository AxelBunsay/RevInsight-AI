export function qrPreviewReducer(isOpen, action) {
  if (action.type === 'open') return true;
  if (action.type === 'close') return false;
  if (action.type === 'escape' || action.type === 'outside-click') return false;
  return isOpen;
}

export async function downloadQrImage(url, {
  fetchImage = (...args) => fetch(...args),
  documentRef,
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (objectUrl) => URL.revokeObjectURL(objectUrl)
} = {}) {
  const response = await fetchImage(url, { mode: 'cors' });
  if (!response.ok) throw new Error('QR image download failed.');
  const blob = await response.blob();
  const objectUrl = createObjectUrl(blob);
  const link = (documentRef || document).createElement('a');
  link.href = objectUrl;
  link.download = 'gcash-qr.png';
  (documentRef || document).body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => revokeObjectUrl(objectUrl), 1000);
}
