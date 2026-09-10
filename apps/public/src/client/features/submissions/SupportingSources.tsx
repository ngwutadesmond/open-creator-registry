import { type FocusEventHandler, useState } from 'react';

import type { RepeatableDraftItem } from './submission-form';

const maximumSources = 10;

type SupportingSourcesProps = {
  errors: Record<string, string>;
  items: RepeatableDraftItem[];
  onAdd: () => string | null;
  onBlur: FocusEventHandler<HTMLInputElement>;
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
};

export function SupportingSources({
  errors,
  items,
  onAdd,
  onBlur,
  onChange,
  onRemove,
}: SupportingSourcesProps) {
  const [announcement, setAnnouncement] = useState('');

  function focus(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  return (
    <fieldset className="repeatable-fieldset">
      <legend className="sr-only">Public supporting sources</legend>
      <div className="repeatable-guidance" id="supporting-sources-help">
        <p>Useful public sources include:</p>
        <ul className="source-examples">
          <li>an official website, YouTube channel, or social account;</li>
          <li>a Spotify artist page, Wikidata, or MusicBrainz record;</li>
          <li>a record-label, management, institutional, or reputable media profile.</li>
        </ul>
        <p>
          The Registry will review these links. Submitting a URL does not prove identity or account
          ownership.
        </p>
      </div>
      <p className="field-count" aria-live="polite">
        {items.length} of {maximumSources} sources added
      </p>
      <div className="repeatable-fields">
        {items.map((item, index) => {
          const inputId = `submission-source-${item.id}`;
          const errorId = `${inputId}-error`;
          const error = errors[item.id];
          return (
            <div className="repeatable-field" key={item.id}>
              <label htmlFor={inputId}>Supporting source {index + 1}</label>
              <div className="repeatable-field-row">
                <input
                  id={inputId}
                  name="public_sources"
                  type="url"
                  inputMode="url"
                  value={item.value}
                  onBlur={onBlur}
                  onChange={(event) => onChange(item.id, event.currentTarget.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`supporting-sources-help${error ? ` ${errorId}` : ''}`}
                  autoCapitalize="none"
                  autoComplete="url"
                  placeholder="https://example.com/official-profile"
                  spellCheck={false}
                />
                {items.length > 1 ? (
                  <button
                    className="remove-field-button"
                    type="button"
                    onClick={() => {
                      onRemove(item.id);
                      setAnnouncement(`Supporting source field ${index + 1} removed.`);
                      const nextItem = items[index - 1] ?? items[index + 1];
                      if (nextItem) focus(`submission-source-${nextItem.id}`);
                    }}
                    aria-label={`Remove supporting source ${index + 1}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {error ? (
                <p className="field-error" id={errorId}>
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        className="text-button add-field-button"
        type="button"
        disabled={items.length >= maximumSources}
        onClick={() => {
          const id = onAdd();
          if (id) {
            setAnnouncement(`Supporting source field ${items.length + 1} added and focused.`);
            focus(`submission-source-${id}`);
          }
        }}
      >
        Add another source
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </fieldset>
  );
}
