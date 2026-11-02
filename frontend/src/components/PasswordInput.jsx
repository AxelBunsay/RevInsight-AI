import { useRef, useState } from 'react';
import './css/password-input.css';

export default function PasswordInput({ className = '', ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef(null);
  const wrapperClassName = ['password-input', className].filter(Boolean).join(' ');
  const inputClassName = ['password-input__field', inputProps.className].filter(Boolean).join(' ');

  return <span className={wrapperClassName}>
    <input {...inputProps} ref={inputRef} className={inputClassName} type={isVisible ? 'text' : 'password'} />
    <button
      type="button"
      className="password-input__toggle"
      aria-label={isVisible ? 'Hide password' : 'Show password'}
      aria-pressed={isVisible}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        setIsVisible((visible) => !visible);
        inputRef.current?.focus();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
        {isVisible && <path d="m4 4 16 16" />}
      </svg>
    </button>
  </span>;
}