export function RegistryIllustration() {
  return (
    <svg
      className="registry-illustration"
      viewBox="0 0 720 420"
      role="img"
      aria-labelledby="registry-illustration-title registry-illustration-description"
    >
      <title id="registry-illustration-title">Registry classification process</title>
      <desc id="registry-illustration-description">
        Names and aliases converge into one registry record and four protection classifications.
      </desc>
      <g className="source-records">
        {[60, 122, 184, 246, 308].map((y) => (
          <g key={y}>
            <rect x="18" y={y} width="150" height="42" rx="6" />
            <path d={`M44 ${y + 21}h74`} />
            <path className="connector" d={`M168 ${y + 21}h72Q280 ${y + 21} 316 210`} />
          </g>
        ))}
      </g>
      <circle className="registry-ring" cx="376" cy="210" r="84" />
      <path
        className="shield"
        d="M376 157 417 175v36c0 30-18 52-41 64-23-12-41-34-41-64v-36l41-18Z"
      />
      <circle className="person" cx="376" cy="206" r="13" />
      <path className="person" d="M350 244c4-16 14-24 26-24s22 8 26 24" />
      <path
        className="classification-rail"
        d="M460 210h47m0-108v216m0-216h28m-28 72h28m-28 72h28m-28 72h28"
      />
      {[
        { y: 80, className: 'hard' },
        { y: 152, className: 'soft' },
        { y: 224, className: 'monitored' },
        { y: 296, className: 'unlisted' },
      ].map(({ y, className }) => (
        <g className="result-record" key={className}>
          <rect x="535" y={y} width="168" height="52" rx="6" />
          <circle className={className} cx="560" cy={y + 26} r="9" />
          <path d={`M582 ${y + 20}h88m-88 13h66`} />
        </g>
      ))}
    </svg>
  );
}
