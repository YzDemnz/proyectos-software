import { useRef, KeyboardEvent, ClipboardEvent } from 'react';

type CodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
};

export function CodeInput({ value, onChange, length = 6, disabled }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const chars = value.split('');
  const focusInput = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, length - 1));
    refs.current[clamped]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (chars[idx]) {
        const next = [...chars];
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        const next = [...chars];
        next[idx - 1] = '';
        onChange(next.join(''));
        focusInput(idx - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      focusInput(idx - 1);
    } else if (e.key === 'ArrowRight') {
      focusInput(idx + 1);
    } else if (e.key === 'Enter') {
      // let the form submit handle it
    } else if (!/^[0-9]$/.test(e.key) && e.key !== 'Tab') {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const digit = e.target.value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...chars];
    next[idx] = digit;
    onChange(next.join(''));
    if (digit && idx < length - 1) focusInput(idx + 1);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      focusInput(Math.min(pasted.length, length - 1));
    }
  };

  return (
    <div className="code-input">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={chars[i] ?? ''}
          disabled={disabled}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-label={`Dígito ${i + 1}`}
        />
      ))}
    </div>
  );
}
