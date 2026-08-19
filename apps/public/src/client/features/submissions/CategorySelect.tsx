import {
  isSubmissionCategory,
  submissionCategories,
  type SubmissionCategory,
} from '@open-creator-registry/contracts/submissions';

import { FormField } from './FormField';
import { fieldDescriptionIds } from './submission-form';

type CategorySelectProps = {
  error?: string;
  onBlur: () => void;
  onChange: (value: SubmissionCategory | '') => void;
  value: SubmissionCategory | '';
};

export function CategorySelect({ error, onBlur, onChange, value }: CategorySelectProps) {
  const id = 'submission-category';
  return (
    <FormField id={id} label="Category" required error={error}>
      <select
        id={id}
        name="category"
        value={value}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={fieldDescriptionIds(id, false, Boolean(error))}
        onBlur={onBlur}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(isSubmissionCategory(next) ? next : '');
        }}
      >
        <option value="">Select a category</option>
        {submissionCategories.map(({ label, value: optionValue }) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
