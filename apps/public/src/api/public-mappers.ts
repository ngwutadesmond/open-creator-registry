import type {
  CreatorAlias,
  CreatorEntity,
  CreatorSource,
  RegistryRelease,
  ReservedHandle,
} from '@open-creator-registry/database/models';

export function mapPublicCreator(creator: CreatorEntity) {
  return {
    id: creator.id,
    canonical_name: creator.canonicalName,
    entity_type: creator.entityType,
    primary_category: creator.primaryCategory,
    country_codes: creator.countryCodes,
    biography_summary: creator.biographySummary,
    notoriety_score: creator.notorietyScore,
    protection_tier: creator.protectionTier,
    created_at: creator.createdAt,
    updated_at: creator.updatedAt,
  };
}

export function mapPublicAlias(alias: CreatorAlias) {
  return {
    id: alias.id,
    alias: alias.alias,
    normalized_alias: alias.normalizedAlias,
    language: alias.language,
    alias_type: alias.aliasType,
    confidence_score: alias.confidenceScore,
  };
}

export function mapPublicHandle(handle: ReservedHandle) {
  const reasonSummary = (() => {
    switch (handle.classification) {
      case 'hard_reserved':
        return 'The exact handle has an active hard-reserved Registry decision.';
      case 'soft_protected':
        return 'The handle has an active soft-protection Registry decision.';
      case 'monitored':
        return 'The handle has an active monitoring Registry decision.';
      case 'not_listed':
        return 'The Registry has no active protection decision for this handle.';
    }
  })();
  return {
    id: handle.id,
    display_handle: handle.displayHandle,
    normalized_handle: handle.normalizedHandle,
    classification: handle.classification,
    confidence_score: handle.confidenceScore,
    status: handle.status,
    reason_summary: reasonSummary,
    created_at: handle.createdAt,
    updated_at: handle.updatedAt,
  };
}

export function mapPublicSource(source: CreatorSource) {
  return {
    id: source.id,
    source_name: source.sourceName,
    source_entity_id: source.sourceEntityId,
    source_url: source.sourceUrl,
    source_license: source.sourceLicense,
    last_checked_at: source.lastCheckedAt,
  };
}

export function mapPublicRelease(release: RegistryRelease) {
  if (!release.publishedAt) {
    throw new Error('A public registry release must have a publication timestamp.');
  }
  return {
    id: release.id,
    version: release.version,
    record_count: release.recordCount,
    checksum: release.checksum,
    published_at: release.publishedAt,
  };
}
