import './Input.css';

export default function Input({
  label,
  error,
  className = '',
  textarea = false,
  ...props
}) {
  const Tag = textarea ? 'textarea' : 'input';
  const inputClasses = ['input', error && 'input--error', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="input-wrapper">
      {label && <label className="input-wrapper__label">{label}</label>}
      <Tag className={inputClasses} {...props} />
      {error && <span className="input-wrapper__error">{error}</span>}
    </div>
  );
}
