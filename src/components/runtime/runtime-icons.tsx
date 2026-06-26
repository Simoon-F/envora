import type { SVGProps } from 'react';
import { GoLogo } from './go-logo';

/**
 * Monochrome runtime glyphs — inherit currentColor so they adapt to the
 * surrounding text color (e.g. active accent, muted idle).
 * Kept simple and geometric for a consistent, professional set.
 */

const wrap = (children: React.ReactNode) => (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const PhpIcon = wrap(
  <>
    <ellipse cx="12" cy="12" rx="10" ry="6" />
    <path d="M8 9.5h2.2a1.6 1.6 0 0 1 0 3.2H8V9.5Zm0 3.2V15" />
    <path d="M13.5 9.5h2.2a1.6 1.6 0 0 1 0 3.2h-2.2V9.5Zm0 3.2V15" />
  </>,
);

export const NginxIcon = wrap(
  <>
    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
    <path d="M9 14.5V9l3 2 3-2v5.5" />
  </>,
);

export const MysqlIcon = wrap(
  <>
    <path d="M5 17c2 0 3-1 3.5-3 .5 2 1.5 3 3.5 3" />
    <path d="M4 8.5c2.5-1 5.5-1 8 0" />
    <path d="M4 12c2.5-1 5.5-1 8 0" />
    <path d="M16 5c1.5 0 2.5 1 2.5 2.5 0 2-2 3.5-2.5 5.5-.3-1.3-.8-2-1.5-2.5" />
    <circle cx="16" cy="6" r="0.4" fill="currentColor" />
  </>,
);

export const JavaIcon = wrap(
  <>
    <path d="M8 18c-1 1-1 2.5.5 2.5 1 0 2-.5 2.5-1.5" />
    <path d="M11 14c2-3 6-2 6-5.5 0-1.5-1-2.5-2-3" />
    <path d="M14 6.5c.5-1 1.5-2 2.5-2 .5 1 .5 2-.5 3" />
    <path d="M10 21h6" />
    <path d="M11 18h4" />
  </>,
);

export const NodeIcon = wrap(
  <>
    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
    <path d="M9 14.5c0 .8.6 1.2 1.8 1.2 1.4 0 2.2-.5 2.2-1.5 0-2-4-1-4-3 0-1 .9-1.6 2.2-1.6 1.2 0 1.8.4 1.8 1.2" />
  </>,
);

/**
 * Map a runtime type to its monochrome icon element.
 * Go reuses its multi-color brand logo (kept as-is).
 */
export const RuntimeIcon = ({
  type,
  className,
}: {
  type: 'php' | 'nginx' | 'mysql' | 'java' | 'node' | 'go';
  className?: string;
}) => {
  switch (type) {
    case 'php':
      return <PhpIcon className={className} />;
    case 'nginx':
      return <NginxIcon className={className} />;
    case 'mysql':
      return <MysqlIcon className={className} />;
    case 'java':
      return <JavaIcon className={className} />;
    case 'node':
      return <NodeIcon className={className} />;
    case 'go':
      return <GoLogo className={className} />;
  }
};
