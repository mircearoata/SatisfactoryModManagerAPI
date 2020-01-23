const path = require('path');
const fs = require('fs');
const assert = require('assert');
const semver = require('semver');
const { SatisfactoryInstall, getManifestFolderPath, UnsolvableDependencyError, DependencyManifestMismatchError } = require('../');
const { modCacheDir, forEachAsync } = require('../lib/utils');
const JSZip = require('jszip');

const dummySfName = 'DummySF';
const dummySfVersion = '109000';
const dummySfPath = path.join(__dirname, 'TestSatisfactoryInstall');
const dummySfExecutable = 'sf.exe';
const dummyMods = [
  {
    mod_id: 'dummyMod1',
    version: '1.0.0',
    dependencies: {
      'SML': '2.0.0',
      '6vQ6ckVYFiidDh': '^1.1.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.1',
    dependencies: {
      'SML': '>=1.0.0',
      '6vQ6ckVYFiidDh': '^1.2.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.2',
    dependencies: {
      'SML': '1.0.1',
      '6vQ6ckVYFiidDh': '^1.3.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.3',
    dependencies: {
      'SML': '^1.0.0',
      '6vQ6ckVYFiidDh': '^1.5.2'
    }
  }
];

async function createDummyMods() {
  await forEachAsync(dummyMods, async (mod) => new Promise((resolve) => {
    const filePath = path.join(modCacheDir, `${mod.mod_id}_${mod.version}.zip`);
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(mod));
    zip
      .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
      .pipe(fs.createWriteStream(filePath))
      .on('finish', function () {
        resolve();
      });
  }));
}

async function removeDummyMods() {
  await forEachAsync(dummyMods, async (mod) => {
    const filePath = path.join(modCacheDir, `${mod.mod_id}_${mod.version}.zip`);
    fs.unlinkSync(filePath);
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
  fs.mkdirSync(dummySfPath, { recursive: true });
  await createDummyMods()

  let success = true;

  try {
    // TODO: maybe better testing
    const sfInstall = new SatisfactoryInstall(dummySfName, dummySfVersion, dummySfPath, dummySfExecutable);
    let installedMods;

    try {
      await sfInstall.installMod('6vQ6ckVYFiidDh', '1.4.1');
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.length, 1, 'Install without dependency failed');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.installMod('dummyMod1', '1.0.0');
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
      await sfInstall.installMod('dummyMod1', '1.0.1');
      installedMods = await sfInstall._getInstalledMods();
      if (!installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.1')) {
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
      await sfInstall.installMod('dummyMod1', '1.0.2');
      installedMods = await sfInstall._getInstalledMods();
      if (!installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.2')) {
        assert.fail('Update mod with solvable SML version conflict failed');
      }
      assert.strictEqual(installedMods.length, 2, 'Update removed/added a mod');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.installMod('dummyMod1', '1.0.3');
      installedMods = await sfInstall._getInstalledMods();
      if (installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.3')) {
        assert.fail('Update mod with conflicting dependency version failed');
      }
      assert.strictEqual(installedMods.length, 2, 'Update removed/added a mod');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      if (!e instanceof DependencyManifestMismatchError) {
        assert.fail(`Unexpected error: ${e}`);
      }
    }

    try {
      await sfInstall.uninstallMod('6vQ6ckVYFiidDh');
      installedMods = await sfInstall._getInstalledMods();
      assert.strictEqual(installedMods.length, 2, 'Uninstall dependency succeeded');
      assert.strictEqual(installedMods.some((mod) => mod.mod_id === '6vQ6ckVYFiidDh' && mod.version === '1.4.1'), true, 'Uninstall dependency changed version');
    } catch (e) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.fail(`Unexpected error: ${e}`);
    }

    try {
      await sfInstall.manifestMutate({});
      assert.deepStrictEqual(installedMods, await sfInstall._getInstalledMods(), 'Empty mutation changed something');
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
    try {
      fs.rmdirSync(dummySfPath, { recursive: true });
      fs.rmdirSync(getManifestFolderPath(dummySfPath), { recursive: true });
    } catch (e) {
      if (e.code === "ENOTEMPTY") {
        deleteFolderRecursive(dummySfPath);
        deleteFolderRecursive(getManifestFolderPath(dummySfPath));
      } else {
        throw e;
      }
    }
    await removeDummyMods();
  }
  if (!success) {
    process.exit(1);
  }
}

main();