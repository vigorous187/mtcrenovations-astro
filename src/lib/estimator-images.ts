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
): string {
  const { src, alt, icon } = resolveEstimatorImage(option, fallbackIcon);
  if (src) {
    return `<img class="${className}" src="${src}" alt="${escapeAttr(alt)}" loading="lazy" width="800" height="450" />`;
  }
  return `<i class="${icon} fa-2x mb-2 text-secondary estimator-card-icon"></i>`;
}

export function thumbnailHtml(
  option: EstimatorImageOption | null | undefined,
  fallbackIcon = "fas fa-image",
): string {
  const { src, alt, icon } = resolveEstimatorImage(option, fallbackIcon);
  if (src) {
    return `<img class="estimator-thumb" src="${src}" alt="${escapeAttr(alt)}" loading="lazy" width="48" height="48" />`;
  }
  return `<span class="estimator-thumb estimator-thumb--icon"><i class="${icon}"></i></span>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}
