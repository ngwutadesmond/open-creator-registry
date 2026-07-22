export function remoteDatabaseArguments({ databaseName, manifestPath }) {
  return [databaseName, '--remote', '--config', manifestPath];
}

export function timeTravelInfoArguments({ databaseName, manifestPath }) {
  return [databaseName, '--config', manifestPath];
}
