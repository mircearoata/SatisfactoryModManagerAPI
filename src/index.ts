import { loadCache, installMod } from './modHandler';

loadCache()
  .then(() => {
    installMod('2y5ShF2iaXAKQm', '1.0.0');
  });
