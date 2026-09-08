import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

const sized = ({ width = 16, height = 16, ...props }: IconProps) => ({
  ...base,
  width,
  height,
  ...props,
});

export const GripIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const PencilIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </svg>
);

export const TrashIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M4 7h16" />
    <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" />
    <path d="M6.5 7 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </svg>
);

export const PlusIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const SendIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M5 12 20 5l-6.5 15-2-6-6.5-2Z" />
  </svg>
);

export const SparkleIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M12 3.5 13.7 9l5.3 1.8-5.3 1.8L12 18l-1.7-5.4L5 10.8 10.3 9 12 3.5Z" />
    <path d="M18.5 15.5 19.2 18l2.3.8-2.3.8-.7 2.4-.7-2.4-2.3-.8 2.3-.8.7-2.5Z" />
  </svg>
);

export const BoardIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9 4.5v15M15 4.5v15" />
  </svg>
);

export const SignOutIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
    <path d="M15 8.5 18.5 12 15 15.5M18.5 12H9.5" />
  </svg>
);

export const LockIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
  </svg>
);

export const UserIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5a7 7 0 0 1 14 0" />
  </svg>
);

export const ChevronDownIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const SettingsIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H2.9a2 2 0 110-4H3a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1h.2a2 2 0 110 4H21a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

export const UsersIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.9" />
    <path d="M16 3.1a4 4 0 010 7.8" />
  </svg>
);

export const ArchiveIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
    <path d="M10 12h4" />
  </svg>
);

export const CalendarIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
);

export const FlagIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M5 21V4h9l-1 3h6l-1.5 4.5L19 16H5" />
  </svg>
);

export const SearchIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const ShieldIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" />
    <path d="M9.5 12l1.8 1.8 3.4-3.6" />
  </svg>
);

export const KeyIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <circle cx="8" cy="14" r="4" />
    <path d="M11 11l9-9 2 2-2 2 2 2-3 3-2-2-2 2z" />
  </svg>
);

export const TagIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M3 12V4a1 1 0 011-1h8l9 9-9 9z" />
    <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const CommentIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M21 12a8 8 0 01-8 8H7l-4 3v-5.5A8 8 0 1121 12z" />
  </svg>
);

export const ChecklistIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M4 7l2 2 3.5-3.5M4 17l2 2 3.5-3.5M13 7h7M13 17h7" />
  </svg>
);

export const ExpandIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M9 4H4v5M15 20h5v-5M4 4l6 6M20 20l-6-6" />
  </svg>
);

export const ChevronUpIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);

export const HistoryIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </svg>
);

export const InboxIcon = (props: IconProps) => (
  <svg {...sized(props)}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M4.6 5.4A2 2 0 0 1 6.4 4h11.2a2 2 0 0 1 1.8 1.4L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
  </svg>
);
