export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={
        compact ? 'registry-disclaimer registry-disclaimer--compact' : 'registry-disclaimer'
      }
    >
      <span aria-hidden="true">i</span>
      <p>
        Registry status is not proof of legal ownership, trademark rights, identity, endorsement, or
        platform username availability.
      </p>
    </aside>
  );
}
