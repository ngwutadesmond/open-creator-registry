import type { PaginationData } from '../api/schemas';

export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationData;
  onPageChange: (page: number) => void;
}) {
  if (pagination.total_pages <= 1) return null;
  const pages = Array.from({ length: pagination.total_pages }, (_, index) => index + 1).filter(
    (page) =>
      page === 1 || page === pagination.total_pages || Math.abs(page - pagination.page) <= 1,
  );

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        disabled={!pagination.has_previous_page}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </button>
      <div className="pagination__pages">
        {pages.map((page, index) => {
          const previousPage = pages[index - 1];
          return (
            <span className="pagination__item" key={page}>
              {previousPage !== undefined && page - previousPage > 1 ? (
                <span className="pagination__ellipsis" aria-hidden="true">
                  …
                </span>
              ) : null}
              <button
                type="button"
                aria-current={page === pagination.page ? 'page' : undefined}
                aria-label={`Page ${page}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!pagination.has_next_page}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
