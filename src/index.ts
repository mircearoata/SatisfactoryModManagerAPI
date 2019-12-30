import ModHandler from './modHandler';

async function init(): Promise<void> {
  await Promise.all([ModHandler.getCachedMods()]);
}

export default { init };
