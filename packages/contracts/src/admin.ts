export const adminRoles = [
  'admin_viewer',
  'reviewer',
  'editor',
  'publisher',
  'super_admin',
] as const;
export type AdminRole = (typeof adminRoles)[number];

export const adminPermissions = [
  'dashboard:read',
  'creators:read',
  'creators:write',
  'aliases:write',
  'sources:write',
  'handles:read',
  'handles:write',
  'handles:critical',
  'candidates:read',
  'candidates:review',
  'submissions:read',
  'submissions:review',
  'imports:read',
  'imports:prepare',
  'imports:commit',
  'ingestion_runs:read',
  'releases:read',
  'releases:write',
  'releases:approve',
  'releases:publish',
  'approvals:read',
  'approvals:decide',
  'audit_logs:read',
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

const viewerPermissions = [
  'dashboard:read',
  'creators:read',
  'handles:read',
  'candidates:read',
  'submissions:read',
  'imports:read',
  'ingestion_runs:read',
  'releases:read',
  'approvals:read',
  'audit_logs:read',
] as const satisfies readonly AdminPermission[];

export const permissionsByAdminRole: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  admin_viewer: viewerPermissions,
  reviewer: [...viewerPermissions, 'candidates:review', 'submissions:review'],
  editor: [
    ...viewerPermissions,
    'creators:write',
    'aliases:write',
    'sources:write',
    'handles:write',
    'imports:prepare',
    'imports:commit',
  ],
  publisher: [
    ...viewerPermissions,
    'releases:write',
    'releases:approve',
    'releases:publish',
    'approvals:decide',
  ],
  super_admin: adminPermissions,
};

export function permissionsForRoles(roles: readonly AdminRole[]): AdminPermission[] {
  const permissions = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of permissionsByAdminRole[role]) permissions.add(permission);
  }
  return [...permissions];
}

export function hasAdminPermission(
  roles: readonly AdminRole[],
  permission: AdminPermission,
): boolean {
  return roles.some((role) => permissionsByAdminRole[role].includes(permission));
}

export const adminAuthenticationSources = ['local_development', 'cloudflare_access'] as const;
export type AdminAuthenticationSource = (typeof adminAuthenticationSources)[number];

export type AdminIdentity = {
  subject: string;
  email: string;
  displayName: string;
  roles: AdminRole[];
  permissions: AdminPermission[];
  authenticationSource: AdminAuthenticationSource;
};

export const approvalActionTypes = [
  'handle.create_critical',
  'handle.update_critical',
  'handle.suspend_critical',
  'handle.release_critical',
  'handle.restore_critical',
  'release.publish',
  'critical.emergency_override',
] as const;
export type ApprovalActionType = (typeof approvalActionTypes)[number];

export const approvalRequestStatuses = [
  'pending',
  'approved',
  'rejected',
  'applied',
  'expired',
  'invalid',
] as const;
export type ApprovalRequestStatus = (typeof approvalRequestStatuses)[number];

export const approvalDecisions = ['approved', 'rejected'] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const importBatchStatuses = [
  'previewed',
  'committing',
  'completed',
  'completed_with_warnings',
  'failed',
] as const;
export type ImportBatchStatus = (typeof importBatchStatuses)[number];

export const importFormats = ['csv', 'json'] as const;
export type ImportFormat = (typeof importFormats)[number];
