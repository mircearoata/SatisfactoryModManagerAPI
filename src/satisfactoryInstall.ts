import { ModHandler, Mod } from './modHandler';
import { SMLHandler } from './smlHandler';
import {
  FicsitAppVersion, getModLatestVersion, FicsitAppMod, getLatestSMLVersion,
} from './ficsitApp';
import { ManifestHandler } from './manifest';
import { ItemVersionList } from './lockfile';
import { debug } from './utils';

export class SatisfactoryInstall {
  satisfactoryPath: string;
  modHandler: ModHandler;
  smlHandler: SMLHandler;
  manifestHandler: ManifestHandler;

  constructor(satisfactoryPath: string) {
    this.satisfactoryPath = satisfactoryPath;
    this.modHandler = new ModHandler(satisfactoryPath);
    this.smlHandler = new SMLHandler(satisfactoryPath);
    this.manifestHandler = new ManifestHandler(satisfactoryPath);
  }

  async manifestMutate(install: ItemVersionList, uninstall: string[]): Promise<void> {
    const changes = await this.manifestHandler.mutate(install, uninstall);
    debug(JSON.stringify(changes));
    await Promise.all(changes.uninstall.map((id) => {
      if (id === 'SML') {
        return this.smlHandler.uninstallSML();
      }
      return this.modHandler.uninstallMod(id);
    }));
    await Promise.all(Object.entries(changes.install).map((modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      if (modInstallID === 'SML') {
        return this.smlHandler.installSML(modInstallVersion);
      }
      return this.modHandler.installMod(modInstallID, modInstallVersion);
    }));
  }

  async installMod(modID: string, version: string): Promise<void> {
    if ((await this.getInstalledMods()).some((mod) => mod.mod_id === modID)) {
      debug(`Updating ${modID}@${version}`);
      return this.manifestMutate({ [modID]: version }, [modID]);
    }
    debug(`Installing ${modID}@${version}`);
    return this.manifestMutate({ [modID]: version }, []);
  }

  async installFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.installMod(modVersion.mod_id, modVersion.version);
  }

  async uninstallMod(modID: string): Promise<void> {
    debug(`Uninstalling ${modID}`);
    return this.manifestMutate({}, [modID]);
  }

  async uninstallFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.uninstallMod(mod.id);
  }

  async updateMod(modID: string): Promise<void> {
    return this.manifestMutate({
      [modID]: (await getModLatestVersion(modID)).version,
    }, [modID]);
  }

  async updateFicsitAppMod(mod: FicsitAppMod): Promise<void> {
    return this.updateMod(mod.id);
  }

  async getInstalledMods(): Promise<Array<Mod>> {
    // TODO: replace with manifest/lockfile get
    return this.modHandler.getInstalledMods();
  }

  async installSML(version: string): Promise<void> {
    if (await this.getSMLVersion()) {
      return this.manifestMutate({ SML: version }, ['SML']);
    }
    return this.manifestMutate({ SML: version }, []);
  }

  async uninstallSML(): Promise<void> {
    return this.manifestMutate({}, ['SML']);
  }

  async updateSML(): Promise<void> {
    return this.manifestMutate({ SML: (await getLatestSMLVersion()).version }, ['SML']);
  }

  async getSMLVersion(): Promise<string | undefined> {
    // TODO: replace with manifest/lockfile get
    return this.smlHandler.getSMLVersion();
  }
}
