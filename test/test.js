process.env.SMM_API_USERAGENT = 'SMMAPITest';
process.env.SMM_API_USERAGENT_VERSION = '0.0';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const semver = require('semver');
const { SatisfactoryInstall, getInstalls, getManifestFolderPath, UnsolvableDependencyError, DependencyManifestMismatchError, InvalidProfileError, ModNotFoundError } = require('../');
const { modCacheDir, forEachAsync, clearCache, hashFile } = require('../lib/utils');
const { addTempMod, addTempModVersion, removeTempMod, removeTempModVersion, setUseTempMods, setTempModReference } = require('../lib/ficsitApp');
const { getProfileFolderPath } = require('../lib/satisfactoryInstall');
const JSZip = require('jszip');

const dummySfName = 'DummySF';
const dummySfVersion = '117050';
const dummySfPath = path.join(__dirname, 'TestSatisfactoryInstall');
const dummySfExecutable = 'sf.exe';
const dummyMods = [
  {
    mod_id: 'dummyMod1',
    mod_reference: 'dummyMod1',
    version: '1.0.0',
    dependencies: {
      'SML': '2.0.0',
    }
  },
  {
    mod_id: 'dummyMod1',
    mod_reference: 'dummyMod1',
    version: '1.0.1',
    dependencies: {
      'SML': '^1.0.0',
    }
  },
  {
    mod_id: 'dummyMod1',
    mod_reference: 'dummyMod1',
    version: '1.0.2',
    dependencies: {
      'SML': '>=1.0.0',
    }
  },
  {
    mod_id: 'dummyMod2',
    mod_reference: 'dummyMod2',
    version: '1.0.0',
    dependencies: {
      'SML': '1.0.0',
      'dummyMod1': '^1.0.0'
    }
  },
  {
    mod_id: 'dummyMod2',
    mod_reference: 'dummyMod2',
    version: '1.0.1',
    dependencies: {
      'SML': '2.0.0',
      'dummyMod1': '^1.0.0'
    }
  },
  {
    mod_id: 'dummyMod2',
    mod_reference: 'dummyMod2',
    version: '1.0.2',
    dependencies: {
      'SML': '>1.0.0',
      'dummyMod1': '^1.0.1'
    }
  },
  {
    mod_id: 'dummyMod3',
    mod_reference: 'dummyMod3',
    version: '1.0.0',
    dependencies: {
      'SML': '>1.0.0',
    }
  },
  {
    mod_id: 'dummyMod4',
    mod_reference: 'dummyMod4',
    version: '1.0.0',
    dependencies: {
      'SML': '>1.0.0',
      'nonExistentMod': '^1.0.1'
    },
  },
  {
    mod_id: 'dummyMod5',
    mod_reference: 'dummyMod5ModReference',
    version: '1.0.0',
    dependencies: {
      'SML': '>=2.0.0',
    }
  }
];

async function createDummyMods() {
  await dummyMods.forEachAsync(async (mod) => new Promise((resolve) => {
    const filePath = path.join(modCacheDir, `${mod.mod_id}_${mod.version}.smod`);
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(mod));
    zip
      .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(filePath))
      .on('finish', function () {
        resolve();
      });
  }));
  const dummyFicsitAppMods = [];
  dummyMods.forEach((mod) => {
    let existingMod = dummyFicsitAppMods.find((faMod) => faMod.id === mod.mod_id);
    if(!existingMod) {
      existingMod = {
        id: mod.mod_id,
        versions: [],
      };
      dummyFicsitAppMods.push(existingMod);
    }
    let smlVersion = mod.dependencies['SML'];
    while(!('0' <= smlVersion[0] && smlVersion[0] <= '9')) {
      smlVersion = smlVersion.substring(1);
    }
    existingMod.versions.push({
      mod_id: mod.mod_id,
      version: mod.version,
      sml_version: smlVersion,
      link: path.join(modCacheDir, `${mod.mod_id}_${mod.version}.smod`),
      dependencies: Object.entries(mod.dependencies).map(([depId, depConstraint]) => ({ mod_id: depId, condition: depConstraint, optional: false })),
      hash: hashFile(path.join(modCacheDir, `${mod.mod_id}_${mod.version}.smod`)),
    });
  });
  dummyFicsitAppMods.forEach((mod) => {
    addTempMod(mod);
  });
}

async function removeDummyMods() {
  await dummyMods.forEachAsync(async (mod) => {
    const filePath = path.join(modCacheDir, `${mod.mod_id}_${mod.version}.smod`);
    if(fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function (file, index) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

async function main() {
  console.log(await getInstalls());

  clearCache();
  setUseTempMods(true);
  
  fs.mkdirSync(dummySfPath, { recursive: true });
  await createDummyMods();

  let success = true;

  deleteFolderRecursive(getProfileFolderPath('testProfile'));

  try {
    // TODO: maybe better testing
    const sfInstall = new SatisfactoryInstall(dummySfName, dummySfVersion, 'Early Access', dummySfPath, dummySfExecutable);
    await sfInstall.setProfile('testProfile');
    let installedMods;

    fs.mkdirSync(sfInstall.modsDir, { recursive: true });
    fs.writeFileSync(path.join(sfInstall.modsDir, 'someFile.randomExt'), '');
    fs.writeFileSync(path.join(sfInstall.modsDir, 'data.json'), '');

    try {
      await sfInstall.installMod('dummyMod4', '1.0.0');
      assert.fail('Install with non existend dependency succeded');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      if (!e instanceof ModNotFoundError) {
        assert.fail(`Unexpected error: ${e}`);
      }
    }

    try {
      await sfInstall.installMod('dummyMod1', '1.0.0');
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.length, 1, 'Install without dependency failed');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.installMod('dummyMod2', '1.0.0');
      installedMods = await sfInstall._getInstalledMods();
      if (installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.0')) {
        assert.fail('Install mod with conflicting SML succeeded');
      }
      assert.strictEqual(installedMods.length, 1, 'Install removed/added a mod');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      if (!e instanceof UnsolvableDependencyError) {
        assert.fail(`Unexpected error: ${e}`);
      }
    }

    try {
      await sfInstall.installMod('dummyMod2', '1.0.1');
      installedMods = await sfInstall._getInstalledMods();
      if (!installedMods.some((mod) => mod.mod_id === 'dummyMod2' && mod.version === '1.0.1')) {
        assert.fail('Install mod with existing dependency failed');
      }
      assert.strictEqual(installedMods.length, 2, 'Install removed/added a mod');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    const testProfileInstalledMods = installedMods;

    try {
      await sfInstall.setProfile('vanilla');
      assert.strictEqual(sfInstall.profile, 'vanilla', 'Failed to set profile to vanilla');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.installMod('dummyMod1');
      assert.fail('Installed a mod in vanilla profile');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      if (!(e instanceof InvalidProfileError)) {
        assert.fail(`Unexpected error: ${e}`);
      }
    }

    try {
      await sfInstall.setProfile('testProfile');
      assert.strictEqual(sfInstall.profile, 'testProfile', 'Failed to set profile to testProfile');
      installedMods = await sfInstall._getInstalledMods();
      assert.deepStrictEqual(testProfileInstalledMods, installedMods, 'Profile was not loaded correctly');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.updateMod('dummyMod1');
      await sfInstall.updateMod('dummyMod2');
      installedMods = await sfInstall._getInstalledMods();
      if (!installedMods.some((mod) => mod.mod_id === 'dummyMod2' && mod.version === '1.0.2') || !installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.2')) {
        assert.fail('Update mod with existing dependency failed');
      }
      assert.strictEqual(installedMods.length, 2, 'Update removed/added a mod');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.uninstallMod('dummyMod1');
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.length, 2, 'Uninstall dependency succeeded');
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.2'), true, 'Uninstall dependency changed version');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.manifestMutate([], [], []);
      assert.deepStrictEqual(installedMods, await sfInstall._getInstalledMods(), 'Empty mutation changed something');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.setProfile('vanilla');
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.length, 0, 'Vanilla is not clean');
      assert.strictEqual(sfInstall.smlVersion, undefined, 'Vanilla is not clean');
      assert.strictEqual(sfInstall.bootstrapperVersion, undefined, 'Vanilla is not clean');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    await sfInstall.setProfile('testProfile');

    await sfInstall.installMod('dummyMod3', '1.0.0');

    removeTempMod('dummyMod3');
    removeTempMod('dummyMod2');

    try {
      await sfInstall.manifestMutate([], [], []);
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod3'), false, 'Removed mod 1 is still installed');
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod2'), false, 'Removed mod 2 is still installed');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    await sfInstall.installMod('dummyMod1');

    removeTempModVersion('dummyMod1', '1.0.2');

    try {
      await sfInstall.manifestMutate([], [], []);
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.2'), false, 'Removed version is still installed');
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.0'), true, 'Incompatible version is still installed');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    removeTempModVersion('dummyMod1', '1.0.0');

    try {
      await sfInstall.manifestMutate([], [], []);
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === 'dummyMod1'), false, 'Mod with all compatible versions removed is still installed');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    setTempModReference('dummyMod5', 'dummyMod5');
    await sfInstall.installMod('dummyMod5');
    setTempModReference('dummyMod5', 'dummyMod5ModReference');

    try {
      await sfInstall.manifestMutate([], [], []);
      installedMods = await sfInstall.mods;
      assert.strictEqual(!!installedMods['dummyMod5ModReference'], true, 'Mod installed with ID updated with mod reference not updated');
      assert.strictEqual(!!installedMods['dummyMod5'], false, 'Mod installed with ID updated with mod reference still installed by ID');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }
  } catch (e) {
    console.error(e);
    success = false;
  } finally {
    deleteFolderRecursive(dummySfPath);
    deleteFolderRecursive(getProfileFolderPath('testProfile'));
    await removeDummyMods();
  }
  if (!success) {
    process.exit(1);
  }
}

main();