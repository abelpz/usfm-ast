export { PROCESSED_CACHE_VERSION } from './constants';

export {
  CatalogSyncEngine,
  DEFAULT_CATALOG_SUBJECTS,
  type CatalogEntryInfo,
  type CatalogIngredient,
  type CatalogSyncEngineOptions,
  type DownloadProgress,
} from './catalog-sync-engine';

export {
  CachedSourceTextProvider,
  type CachedSourceTextProviderOptions,
} from './cached-source-text-provider';

export {
  CacheFirstSourceTextProvider,
  type CacheFirstSourceTextProviderOptions,
} from './cache-first-provider';

export {
  pinProjectToLatestCachedRelease,
  upgradeProjectPin,
  clearProjectSourcePins,
  notifyNewReleaseAvailable,
} from './version-pinning';

export {
  SyncScheduler,
  type SyncDeliveryFn,
  type SyncSchedulerOptions,
} from './sync-scheduler';

export {
  DownloadScheduler,
  type DownloadSchedulerOptions,
  type DownloadProgressEvent,
} from './download-scheduler';

export {
  UpdateChecker,
  scheduleCacheSweep,
  type UpdateCheckerOptions,
} from './update-checker';
