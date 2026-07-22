/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode, useCallback, useContext } from 'react';

import { adminApi } from '../api/admin-api-client';
import { dataEnvelopeSchema, identitySchema, type AdminIdentityResponse } from '../api/schemas';
import { ErrorState, LoadingState } from '../components/AsyncStates';
import { useAdminResource } from '../hooks/useAdminResource';

type AdminIdentityContextValue = {
  identity: AdminIdentityResponse;
  hasPermission: (permission: string) => boolean;
  can: (permission: string) => boolean;
  switchIdentity: (slot: 'primary' | 'secondary') => Promise<void>;
  switchLocalIdentity: (slot: 'primary' | 'secondary') => Promise<void>;
};

const AdminIdentityContext = createContext<AdminIdentityContextValue | null>(null);

export function AdminIdentityProvider({ children }: { children: ReactNode }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get('/api/admin/v1/me', dataEnvelopeSchema(identitySchema), signal),
    [],
  );
  const { resource, retry } = useAdminResource(load, 'admin-identity');
  if (resource.status === 'loading')
    return (
      <main className="authentication-state">
        <LoadingState label="Authenticating administrator…" />
      </main>
    );
  if (resource.status === 'error')
    return (
      <main className="authentication-state">
        <div className="authentication-heading">
          <h1>Administration access denied</h1>
          <p>
            This private Worker defaults to denied until a supported server-side authentication
            provider is configured.
          </p>
        </div>
        <ErrorState error={resource.error} onRetry={retry} />
        <p>
          For local development, copy <code>apps/admin/.dev.vars.example</code> to{' '}
          <code>apps/admin/.dev.vars</code>, then restart the Worker.
        </p>
      </main>
    );
  const identity = resource.data.data;
  const switchIdentity = async (slot: 'primary' | 'secondary') => {
    await adminApi.post(
      '/api/admin/v1/development/identity',
      { slot },
      dataEnvelopeSchema(identitySchema.partial().passthrough()),
    );
    window.location.reload();
  };
  const hasPermission = (permission: string) => identity.permissions.includes(permission);
  const value: AdminIdentityContextValue = {
    identity,
    hasPermission,
    can: hasPermission,
    switchIdentity,
    switchLocalIdentity: switchIdentity,
  };
  return <AdminIdentityContext.Provider value={value}>{children}</AdminIdentityContext.Provider>;
}

export function useAdminIdentity() {
  const context = useContext(AdminIdentityContext);
  if (!context) throw new Error('useAdminIdentity must be used inside AdminIdentityProvider.');
  return context;
}

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useAdminIdentity().hasPermission(permission) ? children : fallback;
}
