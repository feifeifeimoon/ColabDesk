/** A hairline-thin bar under the row it belongs to; in-flight work only. */
export function ProgressBar({ ratio }: { ratio: number }) {
  const clamped = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(clamped * 100)}>
      <span style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
