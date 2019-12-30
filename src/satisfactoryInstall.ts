import ModHandler from './modHandler';
import SMLHandler from './smlHandler';
import { Mod } from './mod';

// TODO: manifests

export default class SatisfactoryInstall {
  satisfactoryPath: string;
  modHandler: ModHandler;
  smlHandler: SMLHandler;

  constructor(satisfactotyPath: string) {
    this.satisfactoryPath = satisfactotyPath;
    this.modHandler = new ModHandler(satisfactotyPath);
    this.smlHandler = new SMLHandler(satisfactotyPath);
  }

  async installMod(modID: string, version: string): Promise<void> {
    return this.modHandler.installMod(modID, version);
  }

  async uninstallMod(modID: string, version: string): Promise<void> {
    return this.modHandler.uninstallMod(modID, version);
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
