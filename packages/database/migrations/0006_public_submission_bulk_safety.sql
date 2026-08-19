ALTER TABLE public_submissions ADD COLUMN normalized_creator_name TEXT;
ALTER TABLE public_submissions ADD COLUMN submission_fingerprint TEXT;
ALTER TABLE public_submissions ADD COLUMN batch_reference TEXT;
ALTER TABLE public_submissions ADD COLUMN batch_row_number INTEGER CHECK (
  batch_row_number IS NULL OR batch_row_number >= 2
);

CREATE INDEX idx_public_submissions_active_normalized_name
  ON public_submissions(normalized_creator_name, submission_status)
  WHERE normalized_creator_name IS NOT NULL
    AND submission_status IN ('pending', 'under_review');

CREATE UNIQUE INDEX idx_public_submissions_active_fingerprint
  ON public_submissions(submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL
    AND submission_status IN ('pending', 'under_review');

CREATE INDEX idx_public_submissions_batch_reference
  ON public_submissions(batch_reference, batch_row_number)
  WHERE batch_reference IS NOT NULL;

CREATE TABLE public_submission_batches (
  id TEXT PRIMARY KEY,
  preview_checksum TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (
    json_valid(result_json) AND json_type(result_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
