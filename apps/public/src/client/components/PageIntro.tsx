export function PageIntro({ description, title }: { description: React.ReactNode; title: string }) {
  return (
    <header className="page-intro">
      <h1>{title}</h1>
      <div className="page-intro__summary">{description}</div>
    </header>
  );
}
