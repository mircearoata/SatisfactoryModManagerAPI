import { ModHandler, Mod } from './modHandler';
import { SMLHandler } from './smlHandler';
import { FicsitAppVersion } from './ficsitApp';
import { ManifestHandler } from './manifest';
import { ItemVersionList } from './lockfile';

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
    await Promise.all(changes.uninstall.map((id) => this.modHandler.uninstallMod(id)));
    await Promise.all(Object.entries(changes.install).map((modInstall) => {
      const modInstallID = modInstall[0];
      const modInstallVersion = modInstall[1];
      return this.modHandler.installMod(modInstallID, modInstallVersion);
    }));
  }

  async installMod(modID: string, version: string): Promise<void> {
    return this.manifestMutate({ [modID]: version }, []);
  }

  async installFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.installMod(modVersion.mod_id, modVersion.version);
  }

  async uninstallMod(modID: string): Promise<void> {
    return this.manifestMutate({}, [modID]);
  }

  async uninstallFicsitAppMod(modVersion: FicsitAppVersion): Promise<void> {
    return this.uninstallMod(modVersion.mod_id);
  }

  async getInstalledMods(): Promise<Array<Mod>> {
    return this.modHandler.getInstalledMods();
  }

  async installSML(version: string): Promise<void> {
    return this.smlHandler.installSML(version);
  }

  async uninstallSML(): Promise<void> {
    return this.smlHandler.uninstallSML();
  }

  async getSMLVersion(): Promise<string | undefined> {
    return this.smlHandler.getSMLVersion();
  }
}
