import type { ComponentType, ImgHTMLAttributes } from 'react';

/**
 * Official colored brand logos for each runtime, served as static SVG assets
 * from /public/logos (sourced from gilbarbara/logos). These keep their
 * original brand colors and gradients — they do NOT inherit currentColor.
 * Callers control sizing via `className` (e.g. size-7).
 */

type IconProps = ImgHTMLAttributes<HTMLImageElement>;
type IconComponent = ComponentType<IconProps>;

const logo = (src: string, alt: string): IconComponent => (props: IconProps) => (
  <img src={src} alt={alt} role="img" decoding="async" {...props} />
);

export const PhpIcon = logo('/logos/php.svg', 'PHP');
export const NginxIcon = logo('/logos/nginx.svg', 'Nginx');
export const MysqlIcon = logo('/logos/mysql.svg', 'MySQL');
export const JavaIcon = logo('/logos/java.svg', 'Java');
export const NodeIcon = logo('/logos/nodejs.svg', 'Node.js');
export const GoIcon = logo('/logos/go.svg', 'Go');
export const ComposerIcon = logo('/logos/composer.svg', 'Composer');

const LOGO_BY_TYPE: Record<'php' | 'nginx' | 'mysql' | 'java' | 'node' | 'go', IconComponent> = {
  php: PhpIcon,
  nginx: NginxIcon,
  mysql: MysqlIcon,
  java: JavaIcon,
  node: NodeIcon,
  go: GoIcon,
};

/**
 * Map a runtime type to its official colored brand logo.
 * Callers size via `className`.
 */
export const RuntimeIcon = ({
  type,
  className,
}: {
  type: 'php' | 'nginx' | 'mysql' | 'java' | 'node' | 'go';
  className?: string;
}) => {
  const Icon = LOGO_BY_TYPE[type];
  return <Icon className={className} />;
};
