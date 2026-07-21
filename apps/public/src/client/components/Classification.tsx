import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import { classificationContent } from './classification-content';

export function ClassificationBadge({
  classification,
}: {
  classification: RegistryClassification;
}) {
  return (
    <span className={`classification-badge classification-badge--${classification}`}>
      <span className={`classification-dot ${classification}`} aria-hidden="true" />
      {classificationContent[classification].label}
    </span>
  );
}
