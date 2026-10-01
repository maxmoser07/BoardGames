/** Wortmarke und Spielfeld-Symbol der App – bewusst als Inline-SVG. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="BoardGames"
    >
      <rect className="logo__board" x="1" y="1" width="30" height="30" rx="8" />
      <circle className="logo__disc logo__disc--red" cx="10.5" cy="10.5" r="4" />
      <circle className="logo__disc logo__disc--yellow" cx="21.5" cy="10.5" r="4" />
      <circle className="logo__disc logo__disc--yellow" cx="10.5" cy="21.5" r="4" />
      <circle className="logo__disc logo__disc--red" cx="21.5" cy="21.5" r="4" />
    </svg>
  );
}
