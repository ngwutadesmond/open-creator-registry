import { type FocusEventHandler, useState } from 'react';

import type { RepeatableDraftItem } from './submission-form';

const maximumUsernames = 10;

type RequestedUsernamesProps = {
  errors: Record<string, string>;
  items: RepeatableDraftItem[];
  onAdd: () => string | null;
  onBlur: FocusEventHandler<HTMLInputElement>;
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
};

export function RequestedUsernames({
  errors,
  items,
  onAdd,
  onBlur,
  onChange,
  onRemove,
}: RequestedUsernamesProps) {
  const [announcement, setAnnouncement] = useState('');

  function focus(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  return (
    <fieldset className="repeatable-fieldset">
      <legend className="sr-only">Requested usernames</legend>
      <p className="repeatable-guidance" id="requested-usernames-help">
        Add usernames that are strongly associated with this creator. Reviewers will decide whether
        they require protection.
      </p>
      <p className="field-count" aria-live="polite">
        {items.length} of {maximumUsernames} usernames added
      </p>
      <div className="repeatable-fields">
        {items.map((item, index) => {
          const inputId = `submission-handle-${item.id}`;
          const errorId = `${inputId}-error`;
          const error = errors[item.id];
          return (
            <div className="repeatable-field" key={item.id}>
              <label htmlFor={inputId}>Username {index + 1}</label>
              <div className="repeatable-field-row">
                <div className="handle-input-wrap">
                  <span aria-hidden="true">@</span>
                  <input
                    id={inputId}
                    name="requested_handles"
                    value={item.value}
                    onBlur={onBlur}
                    onChange={(event) => onChange(item.id, event.currentTarget.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={`requested-usernames-help${error ? ` ${errorId}` : ''}`}
                    autoCapitalize="none"
                    autoComplete="off"
                    maxLength={128}
                    placeholder="creatorhandle"
                    spellCheck={false}
                  />
                </div>
                {items.length > 1 ? (
                  <button
                    className="remove-field-button"
                    type="button"
                    onClick={() => {
                      onRemove(item.id);
                      setAnnouncement(`Username field ${index + 1} removed.`);
                      const nextItem = items[index - 1] ?? items[index + 1];
                      if (nextItem) focus(`submission-handle-${nextItem.id}`);
                    }}
                    aria-label={`Remove username ${index + 1}`}
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
        disabled={items.length >= maximumUsernames}
        onClick={() => {
          const id = onAdd();
          if (id) {
            setAnnouncement(`Username field ${items.length + 1} added and focused.`);
            focus(`submission-handle-${id}`);
          }
        }}
      >
        Add another username
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </fieldset>
  );
}
