import 'isomorphic-fetch';
import path from 'path';
import fs from 'fs';
import { describe, before, beforeEach } from "mocha";
import 'should';
import { clearCache, clearOutdatedCache, getInstalls, getProfileFolderPath, InvalidProfileError, loadCache, ModNotFoundError, ModRemovedByAuthor, SatisfactoryInstall, ValidationError } from "../src";
import should from 'should';
import { createDummyMods, removeDummyMods } from './dummyMods';
import { addModToCache, getCachedModPath, removeModFromCache } from '../src/mods/modCache';

const dummySfName = 'DummySF';
const dummySfVersion = '155370';
const dummySfPath = path.join(__dirname, 'TestSatisfactoryInstall');
const dummySfExecutable = 'sf.exe';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(function () {
  clearCache();
  fs.mkdirSync(dummySfPath, { recursive: true });
})

after(function () {
  fs.rmSync(dummySfPath, { recursive: true, force: true });
  fs.rmSync(getProfileFolderPath('testProfile'), { recursive: true, force: true });
})

it('should find installs', async function() {
  await getInstalls();
});

describe('live mods', function() {
  this.timeout('10s');

  const sfInstall = new SatisfactoryInstall(dummySfName, dummySfVersion, 'Early Access', dummySfPath, dummySfExecutable);

  beforeEach(async function () {
    await sfInstall.setProfile('testProfile');
    await sfInstall.manifestMutate([], sfInstall.readManifest().items.map((item) => item.id), [], [], []); // Uninstall everything
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(0);
  });

  it('should install 1 mod', async function() {
    await sfInstall.installMod('AreaActions');
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(1, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 1 mod`);
  });

  it('should install 2 mods', async function() {
    await sfInstall.installMod('AreaActions');
    await sfInstall.installMod('AdvancedLogistics');
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(2, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 2 mods`);
  });

  it('should not install mods', async function() {
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(0, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 0 mods`);
  });

  it('should not install mods with conflicting SML versions', async function() {
    await sfInstall.installMod('AdvancedLogistics');
    await should(sfInstall.installMod('AreaActions', '1.6.4')).rejectedWith(ValidationError);
  });

  it('should not change dependency version', async function() {
    await sfInstall.installSML('3.0.0');
    await sfInstall.installMod('AreaActions');
    sfInstall.smlVersion.should.equal('3.0.0', 'Installing a mod changed the dependency version');
  });

  it('should disable and enable mods', async function() {
    await sfInstall.installMod('AreaActions');
    {
      await sfInstall.disableMod('AreaActions');
      const installedMods = await sfInstall._getInstalledMods();
      installedMods.length.should.equal(0, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 0 mods`);
    }
    {
      await sfInstall.enableMod('AreaActions');
      const installedMods = await sfInstall._getInstalledMods();
      installedMods.length.should.equal(1, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 1 mod`);
    }
  });

  it('should not install mods in vanila', async function() {
    await sfInstall.installMod('AreaActions');
    {
      await sfInstall.setProfile('vanilla');
      const installedMods = await sfInstall._getInstalledMods();
      installedMods.length.should.equal(0, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 0 mods`);
    }
    {
      await should(sfInstall.installMod('AreaActions')).rejectedWith(InvalidProfileError);
      const installedMods = await sfInstall._getInstalledMods();
      installedMods.length.should.equal(0, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 0 mods`);
      should(sfInstall.smlVersion).be.undefined();
      should(sfInstall.bootstrapperVersion).be.undefined();
    }
  });

  it('should redownload corrupt mod', async function() {
    fs.writeFileSync(getCachedModPath('AreaActions', '1.6.5'), 'corrupt');
    await sfInstall.installMod('AreaActions', '1.6.5');
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(1, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 1 mod`);
  });
});

describe('offline dummy mods', function() {
  this.timeout('10s');

  let dummyModVersions: { mod_reference: string, version: string }[] = [];

  beforeEach(async function () {
    dummyModVersions = await createDummyMods();
    await loadCache();
  });

  const sfInstall = new SatisfactoryInstall(dummySfName, dummySfVersion, 'Early Access', dummySfPath, dummySfExecutable);
  before(async function () {
    await sfInstall.setProfile('testProfile');
  });

  beforeEach(async function () {
    await sfInstall.manifestMutate([], sfInstall.readManifest().items.map((item) => item.id), [], [], []); // Uninstall everything
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(0);
    await sleep(1000);
  });

  it('should not install mod with nonexistent dependency', async function() {
    await should(sfInstall.installMod('dummyMod0')).rejectedWith(ValidationError);
  });

  it('should not uninstall dependency', async function() {
    await sfInstall.installMod('dummyMod2');
    await sfInstall.installMod('dummyMod1');
    await sfInstall.uninstallMod('dummyMod2');
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(2, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 2 mods`);
  });

  it('should uninstall removed version', async function() {
    await sfInstall.installMod('dummyMod3');
    await removeModFromCache('dummyMod3', '2.1.0');
    await sfInstall.manifestMutate([], [], [], [], []);
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(1, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 1 mod`);
    installedMods[0].version.should.equal('2.0.0', 'Removed mod version was not changed to another existing version');
  });

  it('should throw error when all compatible versions are removed, and allow removal', async function() {
    await sfInstall.installMod('dummyMod2');
    await sfInstall.installMod('dummyMod3');
    await removeModFromCache('dummyMod3', '2.1.0');
    await removeModFromCache('dummyMod3', '2.0.0');
    await should(sfInstall.manifestMutate([], [], [], [], [])).rejectedWith(ModRemovedByAuthor);
    await sfInstall.manifestMutate([], ['dummyMod3'], [], [], []);
    const installedMods = await sfInstall._getInstalledMods();
    installedMods.length.should.equal(1, `Expected ${installedMods.map((mod) => `${mod.mod_reference}@${mod.version}`)} to contain 1 mod`);
  });

  it('should clear outdated cache', async function() {
    dummyModVersions.forEach((mod) => {
      const filePath = getCachedModPath(mod.mod_reference, mod.version);
      fs.utimesSync(filePath, new Date(2000, 1, 1), new Date(2000, 1, 1));
    });
    clearOutdatedCache();
    should(dummyModVersions.some((mod) => {
      const filePath = getCachedModPath(mod.mod_reference, mod.version);
      return fs.existsSync(filePath);
    })).equal(false, 'Some outdated cache was not removed.');
  });

  after(function () {
    removeDummyMods();
  });
});