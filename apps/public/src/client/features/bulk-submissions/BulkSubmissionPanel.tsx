import { type DragEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import {
  formatCountryCode,
  formatSubmissionCategory,
  maximumBulkSubmissionRows,
} from '@open-creator-registry/contracts/submissions';

import { PublicApiError, publicApi } from '../../api/public-api-client';
import type { BulkSubmissionCommitResult, BulkSubmissionPreview } from '../../api/schemas';
import { downloadBulkCsvReport, downloadCsvTemplate, downloadXlsxTemplate } from './bulk-templates';
import { BulkFileError, type ParsedBulkFile } from './bulk-file-types';
import { parseBulkFile } from './parse-bulk-file';

type PreviewFilter = 'all' | 'ready' | 'duplicate' | 'warning' | 'invalid';
type BulkStage = 'empty' | 'parsing' | 'preview' | 'confirming' | 'committing' | 'result';

type BulkSubmissionPanelProps = {
  onSubmitOne: () => void;
};

type PendingFile = {
  format: string;
  name: string;
  size: number;
};

function readableFileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KiB`;
}

function statusLabel(status: BulkSubmissionPreview['rows'][number]['status']): string {
  if (status === 'ready') return 'Ready';
  if (status === 'exact_duplicate') return 'Duplicate';
  if (status === 'possible_duplicate') return 'Warning';
  return 'Invalid';
}

function requestErrorMessage(error: PublicApiError): string {
  if (error.status === 429) return 'Too many bulk requests. Wait before trying again.';
  if (error.status === 0 || error.code === 'network_error') {
    return 'The Registry could not be reached. Check your connection and try again.';
  }
  if (error.status === 409) return `${error.message} Preview the spreadsheet again if needed.`;
  return error.message;
}

export default function BulkSubmissionPanel({ onSubmitOne }: BulkSubmissionPanelProps) {
  const [stage, setStage] = useState<BulkStage>('empty');
  const [file, setFile] = useState<ParsedBulkFile | null>(null);
  const [preview, setPreview] = useState<BulkSubmissionPreview | null>(null);
  const [result, setResult] = useState<BulkSubmissionCommitResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [confirmedPossibleRows, setConfirmedPossibleRows] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [error, setError] = useState<Error | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [templatePending, setTemplatePending] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseAbortRef = useRef<AbortController | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const commitPendingRef = useRef(false);
  const commitIdRef = useRef(crypto.randomUUID());

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    if (filter === 'ready') return preview.rows.filter(({ status }) => status === 'ready');
    if (filter === 'duplicate') {
      return preview.rows.filter(({ status }) => status === 'exact_duplicate');
    }
    if (filter === 'warning') {
      return preview.rows.filter(({ status }) => status === 'possible_duplicate');
    }
    if (filter === 'invalid') return preview.rows.filter(({ status }) => status === 'invalid');
    return preview.rows;
  }, [filter, preview]);
  const selectedCount = selectedRows.size;

  async function requestPreview(parsedFile: ParsedBulkFile) {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const response = await publicApi.previewBulkSubmissions(parsedFile.rows, controller.signal);
    const readyRows = response.data.rows
      .filter(({ status }) => status === 'ready')
      .map(({ row_number: rowNumber }) => rowNumber);
    setFile(parsedFile);
    setPreview(response.data);
    setSelectedRows(new Set(readyRows));
    setConfirmedPossibleRows(new Set());
    setFilter('all');
    setStage('preview');
    setLiveMessage(
      `Preview ready. ${response.data.summary.ready} rows are ready and selected by default.`,
    );
  }

  async function chooseFile(nextFile: File) {
    parseAbortRef.current?.abort();
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setError(null);
    setResult(null);
    setPendingFile({
      format: nextFile.name.split('.').pop()?.toLocaleUpperCase('en') || 'Unknown',
      name: nextFile.name,
      size: nextFile.size,
    });
    setStage('parsing');
    setLiveMessage(`Parsing ${nextFile.name}.`);
    try {
      const parsedFile = await parseBulkFile(nextFile, controller.signal);
      await requestPreview(parsedFile);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught : new Error('The file could not be processed.'));
      setStage('empty');
      setLiveMessage('The file could not be processed.');
    }
  }

  async function retryPreview() {
    if (!file) return;
    setError(null);
    setStage('parsing');
    try {
      await requestPreview(file);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught : new Error('The preview could not be refreshed.'));
      setStage('preview');
    }
  }

  function reset() {
    parseAbortRef.current?.abort();
    requestAbortRef.current?.abort();
    commitPendingRef.current = false;
    commitIdRef.current = crypto.randomUUID();
    setFile(null);
    setPreview(null);
    setResult(null);
    setPendingFile(null);
    setSelectedRows(new Set());
    setConfirmedPossibleRows(new Set());
    setFilter('all');
    setError(null);
    setConfirmChecked(false);
    setStage('empty');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggleRow(rowNumber: number, possibleDuplicate: boolean) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
    if (possibleDuplicate) {
      setConfirmedPossibleRows((current) => {
        const next = new Set(current);
        if (next.has(rowNumber)) next.delete(rowNumber);
        else next.add(rowNumber);
        return next;
      });
    }
  }

  async function commit() {
    if (!file || !preview || commitPendingRef.current || !confirmChecked) return;
    commitPendingRef.current = true;
    setStage('committing');
    setError(null);
    setLiveMessage(`Submitting ${selectedRows.size} selected rows.`);
    try {
      const response = await publicApi.commitBulkSubmissions({
        commit_id: commitIdRef.current,
        preview_checksum: preview.preview_checksum,
        rows: file.rows,
        selected_row_numbers: [...selectedRows],
        confirmed_possible_duplicate_row_numbers: [...confirmedPossibleRows].filter((rowNumber) =>
          selectedRows.has(rowNumber),
        ),
      });
      setResult(response.data);
      setStage('result');
      setLiveMessage(
        `${response.data.total_pending_submissions_created} pending submissions created.`,
      );
      window.scrollTo({ top: 0 });
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('The batch could not be submitted.'));
      setStage('confirming');
      setLiveMessage('The batch could not be submitted. Your preview has been preserved.');
    } finally {
      commitPendingRef.current = false;
    }
  }

  function downloadPreviewReport() {
    if (!preview) return;
    downloadBulkCsvReport(
      'creator-submission-preview.csv',
      ['row_number', 'status', 'creator_name', 'errors', 'warnings'],
      preview.rows.map((row) => [
        String(row.row_number),
        row.status,
        row.normalized?.creator_name ?? '',
        row.errors.map(({ message }) => message).join(' | '),
        row.warnings.map(({ message }) => message).join(' | '),
      ]),
    );
  }

  function downloadResultReport() {
    if (!result) return;
    downloadBulkCsvReport(
      'creator-submission-results.csv',
      ['row_number', 'status', 'submission_id', 'messages'],
      result.rows.map((row) => [
        String(row.row_number),
        row.status,
        row.submission_id ?? '',
        row.messages.join(' | '),
      ]),
    );
  }

  const displayError = error
    ? error instanceof PublicApiError
      ? requestErrorMessage(error)
      : error instanceof BulkFileError
        ? error.message
        : error.message
    : null;

  return (
    <section className="bulk-submission" aria-labelledby="bulk-submission-title">
      <div className="bulk-introduction">
        <h2 id="bulk-submission-title">Upload multiple creators</h2>
        <p>
          Upload a CSV or Excel spreadsheet containing multiple creators. The file will be checked
          before anything is submitted. Valid rows become pending submissions for administrator
          review; they do not approve creators or reserve usernames.
        </p>
        <div className="privacy-notice">
          <h3>Use public creator information only</h3>
          <p>
            Do not include private identity documents, passwords, private addresses, phone numbers,
            contracts, or confidential creator-claim evidence. Raw spreadsheet files are parsed in
            your browser and are not uploaded or retained.
          </p>
        </div>
      </div>

      {displayError ? (
        <div className="validation-summary bulk-error" role="alert" tabIndex={-1}>
          <h3>The spreadsheet could not be processed</h3>
          <p>{displayError}</p>
          {error instanceof PublicApiError && error.requestId ? (
            <p className="request-id">Request ID: {error.requestId}</p>
          ) : null}
          {file && preview ? (
            <button className="secondary-button" type="button" onClick={() => void retryPreview()}>
              Try preview again
            </button>
          ) : null}
        </div>
      ) : null}

      {stage === 'empty' ? (
        <div className="bulk-empty-state">
          <div
            className={dragActive ? 'bulk-drop-zone bulk-drop-zone--active' : 'bulk-drop-zone'}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragActive(false);
              const droppedFile = event.dataTransfer.files[0];
              if (droppedFile) void chooseFile(droppedFile);
            }}
          >
            <h3>Drop a spreadsheet here</h3>
            <p>CSV or XLSX · maximum 2 MiB · maximum {maximumBulkSubmissionRows} creator rows</p>
            <input
              className="sr-only"
              ref={fileInputRef}
              id="bulk-file-input"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const selectedFile = event.currentTarget.files?.[0];
                if (selectedFile) void chooseFile(selectedFile);
              }}
            />
            <label className="primary-button" htmlFor="bulk-file-input">
              Choose file
            </label>
          </div>
          <div className="template-downloads">
            <div>
              <h3>Start with a template</h3>
              <p>Both templates contain the canonical columns and fictional guidance data.</p>
            </div>
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={downloadCsvTemplate}>
                Download CSV template
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={templatePending}
                onClick={() => {
                  setTemplatePending(true);
                  setError(null);
                  void downloadXlsxTemplate()
                    .catch((caught) =>
                      setError(
                        caught instanceof Error
                          ? caught
                          : new Error('The Excel template could not be prepared.'),
                      ),
                    )
                    .finally(() => setTemplatePending(false));
                }}
              >
                {templatePending ? 'Preparing Excel template…' : 'Download Excel template'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stage === 'parsing' ? (
        <div className="bulk-progress" role="status">
          <h3>Checking {file?.fileName ?? pendingFile?.name ?? 'the spreadsheet'}…</h3>
          {pendingFile ? (
            <p>
              {pendingFile.format} · {readableFileSize(pendingFile.size)}
            </p>
          ) : null}
          <p>Parsing the file locally, then asking the Registry to validate structured rows.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              parseAbortRef.current?.abort();
              requestAbortRef.current?.abort();
              reset();
              setLiveMessage('Spreadsheet parsing cancelled.');
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {file && preview && ['preview', 'confirming', 'committing'].includes(stage) ? (
        <>
          <div className="bulk-file-summary">
            <div>
              <span>File</span>
              <strong>{file.fileName}</strong>
            </div>
            <div>
              <span>Format</span>
              <strong>{file.format.toUpperCase()}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{readableFileSize(file.fileSize)}</strong>
            </div>
          </div>
          {file.warnings.length ? (
            <div className="bulk-file-warnings" role="status">
              {file.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <section className="bulk-column-mapping" aria-labelledby="column-mapping-title">
            <h3 id="column-mapping-title">Detected column mapping</h3>
            <dl>
              {Object.entries(file.mapping).map(([column, header]) => (
                <div key={column}>
                  <dt>{header}</dt>
                  <dd>{column}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="preview-summary-title">
            <div className="section-heading section-heading--inline">
              <div>
                <h3 id="preview-summary-title">Spreadsheet preview</h3>
                <p>Review every row before opening the final confirmation.</p>
              </div>
              <button className="secondary-button" type="button" onClick={downloadPreviewReport}>
                Download preview report
              </button>
            </div>
            <dl className="bulk-preview-summary">
              <div>
                <dt>Total rows</dt>
                <dd>{preview.summary.total_rows}</dd>
              </div>
              <div>
                <dt>Ready</dt>
                <dd>{preview.summary.ready}</dd>
              </div>
              <div>
                <dt>Exact duplicates</dt>
                <dd>{preview.summary.exact_duplicates}</dd>
              </div>
              <div>
                <dt>Possible duplicates</dt>
                <dd>{preview.summary.possible_duplicates}</dd>
              </div>
              <div>
                <dt>Invalid rows</dt>
                <dd>{preview.summary.invalid}</dd>
              </div>
              <div>
                <dt>Rows with warnings</dt>
                <dd>{preview.summary.rows_with_warnings}</dd>
              </div>
            </dl>
          </section>
          <div className="bulk-preview-filters" aria-label="Filter preview rows">
            {(['all', 'ready', 'duplicate', 'warning', 'invalid'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value[0]?.toUpperCase()}
                {value.slice(1)}
              </button>
            ))}
          </div>
          <div
            className="bulk-preview-table-wrap"
            role="region"
            aria-label="Creator row preview"
            tabIndex={0}
          >
            <table className="bulk-preview-table">
              <thead>
                <tr>
                  <th scope="col">Submit</th>
                  <th scope="col">Row</th>
                  <th scope="col">Creator</th>
                  <th scope="col">Category</th>
                  <th scope="col">Countries</th>
                  <th scope="col">Usernames</th>
                  <th scope="col">Sources</th>
                  <th scope="col">Status and details</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const selectable = row.status === 'ready' || row.status === 'possible_duplicate';
                  const possible = row.status === 'possible_duplicate';
                  return (
                    <tr key={row.row_number} data-status={row.status}>
                      <td data-label="Submit">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(row.row_number)}
                          disabled={!selectable || stage !== 'preview'}
                          aria-label={
                            possible
                              ? `Include possible duplicate row ${row.row_number} after review`
                              : `Submit row ${row.row_number}`
                          }
                          onChange={() => toggleRow(row.row_number, possible)}
                        />
                      </td>
                      <td data-label="Row">{row.row_number}</td>
                      <td data-label="Creator">{row.normalized?.creator_name ?? 'Invalid row'}</td>
                      <td data-label="Category">
                        {formatSubmissionCategory(row.normalized?.category) ?? '—'}
                      </td>
                      <td data-label="Countries">
                        {row.normalized?.country_codes.map(formatCountryCode).join(', ') || '—'}
                      </td>
                      <td data-label="Usernames">
                        {row.normalized?.requested_handles.length ?? 0}
                      </td>
                      <td data-label="Sources">{row.normalized?.public_sources.length ?? 0}</td>
                      <td data-label="Status and details">
                        <strong className={`bulk-row-status bulk-row-status--${row.status}`}>
                          {statusLabel(row.status)}
                        </strong>
                        {[...row.errors, ...row.warnings].length ? (
                          <ul>
                            {[...row.errors, ...row.warnings].map((item) => (
                              <li key={`${item.code}:${item.message}`}>{item.message}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>No issues found.</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bulk-selection-summary" aria-live="polite">
            <strong>{selectedCount} rows will be submitted</strong>
            <span>Exact duplicates and invalid rows cannot be selected.</span>
          </div>
          {stage === 'preview' ? (
            <div className="form-actions bulk-preview-actions">
              <button className="secondary-button" type="button" onClick={reset}>
                Choose a different file
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={selectedCount === 0}
                onClick={() => {
                  setConfirmChecked(false);
                  setStage('confirming');
                }}
              >
                Review {selectedCount} selected rows
              </button>
            </div>
          ) : null}
          {stage === 'confirming' || stage === 'committing' ? (
            <section className="bulk-confirmation" aria-labelledby="bulk-confirmation-title">
              <h3 id="bulk-confirmation-title">Confirm bulk submission</h3>
              <dl>
                <div>
                  <dt>Submissions to create</dt>
                  <dd>{selectedCount}</dd>
                </div>
                <div>
                  <dt>Exact duplicates to skip</dt>
                  <dd>{preview.summary.exact_duplicates}</dd>
                </div>
                <div>
                  <dt>Invalid rows</dt>
                  <dd>{preview.summary.invalid}</dd>
                </div>
              </dl>
              <p>
                Every accepted row enters pending administrator review. No creator is approved and
                no username is reserved by this action.
              </p>
              <label className="bulk-confirm-checkbox">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  disabled={stage === 'committing'}
                  onChange={(event) => setConfirmChecked(event.currentTarget.checked)}
                />
                I confirm that the selected rows contain public information and should be submitted
                for review.
              </label>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={stage === 'committing'}
                  onClick={() => setStage('preview')}
                >
                  Back to preview
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!confirmChecked || stage === 'committing'}
                  onClick={() => void commit()}
                >
                  {stage === 'committing' ? 'Submitting spreadsheet…' : 'Submit selected rows'}
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {stage === 'result' && result ? (
        <div className="bulk-result" aria-live="polite">
          <p className="record-type">Spreadsheet submission</p>
          <h2>Spreadsheet processed</h2>
          <p>
            Accepted rows are pending human review. No creator was approved and no username was
            reserved.
          </p>
          <dl className="bulk-result-summary">
            <div>
              <dt>Batch reference</dt>
              <dd>{result.batch_reference}</dd>
            </div>
            <div>
              <dt>Submitted rows</dt>
              <dd>{result.submitted_rows}</dd>
            </div>
            <div>
              <dt>Skipped exact duplicates</dt>
              <dd>{result.skipped_exact_duplicates}</dd>
            </div>
            <div>
              <dt>Skipped within-file duplicates</dt>
              <dd>{result.skipped_within_file_duplicates}</dd>
            </div>
            <div>
              <dt>Possible duplicates excluded</dt>
              <dd>{result.possible_duplicates_excluded}</dd>
            </div>
            <div>
              <dt>Invalid rows</dt>
              <dd>{result.invalid_rows}</dd>
            </div>
            <div>
              <dt>Failed rows</dt>
              <dd>{result.failed_rows}</dd>
            </div>
            <div>
              <dt>Total pending submissions created</dt>
              <dd>{result.total_pending_submissions_created}</dd>
            </div>
          </dl>
          <p>No review time or approval is guaranteed.</p>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={downloadResultReport}>
              Download results
            </button>
            <button className="secondary-button" type="button" onClick={reset}>
              Upload another spreadsheet
            </button>
            <button className="secondary-button" type="button" onClick={onSubmitOne}>
              Submit one creator
            </button>
            <Link className="primary-button" to="/creators">
              Explore the Registry
            </Link>
          </div>
        </div>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
    </section>
  );
}
