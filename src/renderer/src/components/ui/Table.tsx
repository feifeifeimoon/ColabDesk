import type { ReactNode, ThHTMLAttributes } from "react";

/** The list idiom: hairline rows inside one raised container. */
export function TableContainer({ children }: { children: ReactNode }) {
  return (
    <div className="table-container">
      <table className="table">{children}</table>
    </div>
  );
}

export function Th({ children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...rest}>{children}</th>;
}
