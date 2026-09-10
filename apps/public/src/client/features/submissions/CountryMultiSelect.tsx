import { type KeyboardEvent, useMemo, useRef, useState } from 'react';

import {
  countryOptionsByName,
  formatCountryCode,
  getCountryAliases,
  type CountryCode,
  type CountryOption,
} from '@open-creator-registry/contracts/submissions';

import { FieldError } from './FormField';

const maximumCountries = 10;

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('en')
    .trim();
}

function matchesSearch(option: CountryOption, query: string) {
  if (!query) return true;
  const values = [option.name, option.code, ...getCountryAliases(option.code)];
  return values.some((value) => normalizeSearchValue(value).includes(query));
}

function searchPriority(option: CountryOption, query: string) {
  if (!query) return 3;
  if (option.code.toLocaleLowerCase('en') === query) return 0;
  const name = normalizeSearchValue(option.name);
  if (name === query) return 1;
  return name.startsWith(query) ? 2 : 3;
}

export function SelectedCountryChip({
  code,
  onRemove,
}: {
  code: CountryCode;
  onRemove: () => void;
}) {
  const label = formatCountryCode(code);
  return (
    <li className="selected-country-chip">
      <span>{label}</span>
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

export function ComboboxOption({
  active,
  disabled,
  id,
  onSelect,
  option,
}: {
  active: boolean;
  disabled: boolean;
  id: string;
  onSelect: () => void;
  option: CountryOption;
}) {
  return (
    <li
      className={active ? 'country-option country-option--active' : 'country-option'}
      id={id}
      role="option"
      aria-label={`${option.name} (${option.code})`}
      aria-disabled={disabled}
      aria-selected={false}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!disabled) onSelect();
      }}
    >
      <span>{option.name}</span>
      <span>{option.code}</span>
    </li>
  );
}

type CountryMultiSelectProps = {
  error?: string;
  onChange: (codes: CountryCode[]) => void;
  selected: CountryCode[];
};

export function CountryMultiSelect({ error, onChange, selected }: CountryMultiSelectProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [liveMessage, setLiveMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const normalizedQuery = normalizeSearchValue(query);
  const options = useMemo(() => {
    const matches = countryOptionsByName.filter(
      (option) => !selectedSet.has(option.code) && matchesSearch(option, normalizedQuery),
    );
    return matches.sort(
      (left, right) =>
        searchPriority(left, normalizedQuery) - searchPriority(right, normalizedQuery),
    );
  }, [normalizedQuery, selectedSet]);
  const atMaximum = selected.length >= maximumCountries;
  const listboxId = 'submission-country-options';
  const inputId = 'submission-country-search';
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  function focusInput() {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeList(restoreFocus: boolean) {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) focusInput();
  }

  function selectCountry(code: CountryCode) {
    if (atMaximum || selectedSet.has(code)) return;
    onChange([...selected, code]);
    setQuery('');
    setLiveMessage(`${formatCountryCode(code)} selected.`);
    closeList(true);
  }

  function removeCountry(code: CountryCode) {
    onChange(selected.filter((selectedCode) => selectedCode !== code));
    setLiveMessage(`${formatCountryCode(code)} removed.`);
    focusInput();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeList(true);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (options.length) {
        setActiveIndex((current) => (current < 0 ? 0 : (current + 1) % options.length));
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(options.length - 1, 0));
      } else if (options.length) {
        setActiveIndex((current) =>
          current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length,
        );
      }
      return;
    }

    if (event.key === 'Home' && open && options.length) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End' && open && options.length) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' && open && activeOption) {
      event.preventDefault();
      selectCountry(activeOption.code);
      return;
    }

    if (event.key === 'Enter' && open && options[0]) {
      event.preventDefault();
      selectCountry(options[0].code);
    }
  }

  return (
    <div
      className="form-field form-grid__full country-field"
      ref={rootRef}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !rootRef.current?.contains(nextTarget)) {
          closeList(false);
        }
      }}
    >
      <label id="submission-country-label" htmlFor={inputId}>
        Countries <span className="optional-label">(optional)</span>
      </label>
      <p className="field-help" id="submission-country-help">
        Select the country or countries most closely associated with the creator.
      </p>
      {selected.length ? (
        <ul className="selected-country-list" aria-label="Selected countries">
          {selected.map((code) => (
            <SelectedCountryChip key={code} code={code} onRemove={() => removeCountry(code)} />
          ))}
        </ul>
      ) : null}
      <div className="country-combobox">
        <input
          ref={inputRef}
          id={inputId}
          name="country_search"
          type="search"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={`submission-country-help submission-country-count${error ? ' submission-country-error' : ''}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={Boolean(error)}
          aria-activedescendant={
            open && activeOption ? `${listboxId}-${activeOption.code}` : undefined
          }
          placeholder="Search by country name or code"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {open ? (
          <ul
            className="country-options"
            id={listboxId}
            role="listbox"
            aria-label="Countries"
            aria-multiselectable="true"
          >
            {atMaximum ? (
              <li className="country-options__message" role="presentation">
                Remove a country before selecting another. The maximum is 10.
              </li>
            ) : options.length ? (
              options.map((option, index) => (
                <ComboboxOption
                  key={option.code}
                  id={`${listboxId}-${option.code}`}
                  option={option}
                  active={index === activeIndex}
                  disabled={atMaximum}
                  onSelect={() => selectCountry(option.code)}
                />
              ))
            ) : (
              <li className="country-options__message" role="presentation">
                No matching countries.
              </li>
            )}
          </ul>
        ) : null}
      </div>
      <p className="field-count" id="submission-country-count" aria-live="polite">
        {selected.length} of {maximumCountries} countries selected
      </p>
      <FieldError id="submission-country-error" message={error} />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
    </div>
  );
}
