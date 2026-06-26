/**
 * Resolve estimator card image markup (shared by Astro + client script pattern).
 */
export interface EstimatorImageOption {
  value?: string;
  label?: string;
  image?: string;
  imageAlt?: string;
  icon?: string;
}

export interface EstimatorImageResult {
  src: string | null;
  alt: string;
  icon: string;
}

export function resolveEstimatorImage(
  option: EstimatorImageOption | null | undefined,
  fallbackIcon = "fas fa-image",
): EstimatorImageResult {
  const icon = option?.icon || fallbackIcon;
  const alt = option?.imageAlt || option?.label || "Project option";
  return {
    src: option?.image || null,
    alt,
    icon,
  };
}

export function cardImageHtml(
  option: EstimatorImageOption | null | undefined,
  fallbackIcon = "fas fa-image",
  className = "estimator-card-img",
  loading: "lazy" | "eager" = "lazy",
): string {
  const { src, alt, icon } = resolveEstimatorImage(option, fallbackIcon);
  if (src) {
    return `<img class="${className}" src="${src}" alt="${escapeAttr(alt)}" loading="${loading}" decoding="async" width="400" height="225" />`;
  }
  return `<i class="${icon} fa-lg text-secondary estimator-card-icon"></i>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}
