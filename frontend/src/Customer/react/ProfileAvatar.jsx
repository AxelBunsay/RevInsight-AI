export default function ProfileAvatar({
  initial,
  profileImage,
  previewUrl,
  inputRef,
  isLoading,
  error,
  onChoose,
  onFileChange,
  onRemove
}) {
  const image = previewUrl || profileImage;
  return <div className="customer-account-avatar-group">
    <span className="customer-account-avatar">
      {image
        ? <img src={image} alt="Customer profile" />
        : initial}
    </span>
    <div className="customer-account-avatar-actions">
      <button type="button" className="customer-account-photo-button" onClick={onChoose} disabled={isLoading}>
        {isLoading ? 'Uploading...' : 'Change photo'}
      </button>
      {(profileImage || previewUrl) && <button type="button" className="customer-account-photo-button is-remove" onClick={onRemove} disabled={isLoading}>
        Remove photo
      </button>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={onFileChange} hidden />
    </div>
    {error && <small className="customer-field-error customer-account-photo-error" role="alert">{error}</small>}
  </div>;
}
