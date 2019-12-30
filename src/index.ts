import ModHandler from './modHandler';

ModHandler.getCachedMods()
  .then(() => {
    const modHandler = new ModHandler('C:\\Program Files\\Games\\EpicGames\\SatisfactoryEarlyAccess');
    modHandler.uninstallMod('2y5ShF2iaXAKQm', '1.0.0');
  });
