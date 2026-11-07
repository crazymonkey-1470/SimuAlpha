// Line icons (24x24 grid, currentColor). `size` sets the rendered size in px.
import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function Svg({ size = 24, strokeWidth = 1.6, children, fill = 'none' }: IconProps & { children: ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="icon"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);

export const StarIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.8-4.8" />
  </Svg>
);

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M9 3h6l-1 6 3 3H7l3-3-1-6z" />
    <path d="M12 12v9" />
  </Svg>
);

export const UndoIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}>
    <path d="M5 12.5 10 17.5 19.5 7" />
  </Svg>
);

export const ArchiveIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
);

export const CommentIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M4 5h16v11H10l-5 4v-4H4z" />
  </Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M7 17 17 7" />
    <path d="M9 7h8v8" />
  </Svg>
);

export const ArrowIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
);

export const RssIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5a14 14 0 0 1 14 14" />
    <path d="M5 11a8 8 0 0 1 8 8" />
    <circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const MoreLikeIcon = (p: IconProps) => (
  <Svg strokeWidth={1.7} {...p}>
    <path d="M7 11v9H4v-9z" />
    <path d="M7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a1.6 1.6 0 0 1 1.6 1.9l-1.3 6.5A2 2 0 0 1 17.3 20H7" />
  </Svg>
);

/** Gilt armillary sphere: the old globe, as a mark. */
export const Armillary = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke="#B8924A" strokeWidth={1.4} aria-hidden="true" focusable="false">
    <circle cx="18" cy="16" r="12" />
    <ellipse cx="18" cy="16" rx="12" ry="3.8" />
    <ellipse cx="18" cy="16" rx="4.2" ry="12" />
    <ellipse cx="18" cy="16" rx="12.6" ry="3.1" transform="rotate(-27 18 16)" strokeWidth={2.4} />
    <path d="M18 2.5v27" />
    <circle cx="18" cy="16" r="2.2" fill="#B8924A" stroke="none" />
    <path d="M12 34h12M18 29.5V34" />
  </svg>
);

/** ◆ lozenge used in eyebrows and rules. */
export const Lozenge = ({ size = 7, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
    <path d="M4 0 8 4 4 8 0 4z" fill={color} />
  </svg>
);

/** Gold rule with a lozenge in the middle. */
export const LozengeRule = ({ width = 180 }: { width?: number }) => (
  <div className="lozenge-rule" style={{ width }} aria-hidden="true">
    <span />
    <Lozenge size={8} color="#B8924A" />
    <span />
  </div>
);
