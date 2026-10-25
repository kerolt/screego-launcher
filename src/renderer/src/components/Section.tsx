import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  /** Controlled open state; omit for an uncontrolled <details>. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

/** Collapsible card section: header row with icon/title/meta and a chevron. */
export function Section({ icon, title, meta, children, open, onToggle }: Props) {
  return (
    <details
      className="card"
      open={open}
      onToggle={(e) => onToggle?.((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="sec-icon">{icon}</span>
        <span className="sec-title">{title}</span>
        {meta != null && <span className="sec-meta">{meta}</span>}
        <ChevronDown className="chev" size={15} strokeWidth={2} />
      </summary>
      <div className="card-content">{children}</div>
    </details>
  );
}
