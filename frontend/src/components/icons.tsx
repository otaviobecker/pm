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
