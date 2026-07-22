export class AdminAuthenticationError extends Error {
  constructor(
    readonly code: 'authentication_required' | 'authentication_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthenticationError';
  }
}
