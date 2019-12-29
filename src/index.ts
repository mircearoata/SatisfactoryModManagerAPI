import { getModFromZip } from './modHandler';

getModFromZip('C:\\Program Files\\Games\\EpicGames\\SatisfactoryEarlyAccess\\mods\\UtilityMod.zip')
  .then((mod) => {
    console.log(mod.optional_dependencies);
  });
