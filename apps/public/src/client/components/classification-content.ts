import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import type { HandleMatchType } from '@open-creator-registry/contracts/domain';

export const classificationContent: Record<
  RegistryClassification,
  { action: string; description: string; label: string; title: string }
> = {
  hard_reserved: {
    action:
      'Do not assign this username. Offer the platform’s creator-claim process and continue registration with a unique temporary username.',
    description: 'The exact username is reserved for a recognised creator identity.',
    label: 'Hard reserved',
    title: 'Protected creator username',
  },
  soft_protected: {
    action: 'Require creator verification or manual review before assigning this username.',
    description:
      'This is an official alias, protected variant, strong similarity signal, or confusable form associated with a creator.',
    label: 'Soft protected',
    title: 'Protected or closely associated username',
  },
  monitored: {
    action: 'Apply the consuming platform’s impersonation-monitoring policy.',
    description:
      'This username may relate to a creator, fan community, or archive, but is not treated as the exact protected identity.',
    label: 'Monitored',
    title: 'Monitored creator-related username',
  },
  not_listed: {
    action: 'The consuming platform must still perform its own availability and abuse checks.',
    description: 'The Registry currently has no protection record for this username.',
    label: 'Not listed',
    title: 'Not currently listed',
  },
};

export const matchTypeContent: Record<HandleMatchType, string> = {
  alias: 'Known creator alias',
  confusable_skeleton: 'Visually similar Unicode form',
  exact_handle: 'Exact protected-handle match',
  monitored_variant: 'Monitored creator-related form',
  none: 'No current Registry match',
  official_handle_alias: 'Known official handle',
  protected_variant: 'Protected username variant',
};
