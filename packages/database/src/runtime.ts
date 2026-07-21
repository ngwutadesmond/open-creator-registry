export type RecordMetadataProvider = {
  createId: () => string;
  now: () => string;
};

export const defaultRecordMetadataProvider: RecordMetadataProvider = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

export function createDeterministicMetadataProvider(options: {
  ids: string[];
  timestamp: string;
}): RecordMetadataProvider {
  let index = 0;

  return {
    createId: () => {
      const id = options.ids[index];
      if (!id) {
        throw new Error('The deterministic metadata provider has no remaining IDs.');
      }
      index += 1;
      return id;
    },
    now: () => options.timestamp,
  };
}
