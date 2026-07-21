import { useState } from 'react';

import { CopyIcon } from './Icons';

export function CopyableCodeBlock({ label, value }: { label: string; value: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'unavailable'>('idle');

  async function copy() {
    if (!navigator.clipboard) {
      setCopyStatus('unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('unavailable');
    }
  }

  return (
    <div className="code-block">
      <div className="code-block__toolbar">
        <span>{label}</span>
        <button type="button" onClick={() => void copy()}>
          <CopyIcon />
          {copyStatus === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{value}</code>
      </pre>
      <span className="sr-only" aria-live="polite">
        {copyStatus === 'copied'
          ? `${label} copied to clipboard.`
          : copyStatus === 'unavailable'
            ? 'Clipboard access is unavailable. Select and copy the text manually.'
            : ''}
      </span>
    </div>
  );
}
