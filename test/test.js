const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { SatisfactoryInstall, getManifestFilePath } = require('../');
const { modCacheDir, forEachAsync } = require('../lib/utils');
const JSZip = require('jszip');

const installPath = path.join(__dirname, 'TestSatisfactoryInstall');
const dummyMods = [
  {
    mod_id: 'dummyMod1',
    version: '1.0.0',
    dependencies: {
      'SML': '>=1.0.2',
      '6vQ6ckVYFiidDh': '^1.1.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.1',
    dependencies: {
      'SML': '1.0.0-pr7',
      '6vQ6ckVYFiidDh': '^1.2.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.2',
    dependencies: {
      'SML': '>=1.0.0',
      '6vQ6ckVYFiidDh': '^1.3.0'
    }
  },
  {
    mod_id: 'dummyMod1',
    version: '1.0.3',
    dependencies: {
      'SML': '>=1.0.0-pr7',
      '6vQ6ckVYFiidDh': '^1.3.0'
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

async function main() {
  fs.mkdirSync(installPath, { recursive: true });
  await createDummyMods()

  try {
    const sfInstall = new SatisfactoryInstall(installPath);
    let installedMods;

    await sfInstall.installMod('6vQ6ckVYFiidDh', '1.5.2');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 1, 'Install without dependency failed');

    await sfInstall.installMod('dummyMod1', '1.0.0');
    installedMods = await sfInstall.getInstalledMods();
    if (installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.0')) {
      assert.fail('Install mod with conflicting SML succeeded');
    }
    assert.strictEqual(installedMods.length, 1, 'Install mod with conflicting SML failed the wrong way');

    await sfInstall.installMod('dummyMod1', '1.0.1');
    installedMods = await sfInstall.getInstalledMods();
    if (!installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.1')) {
      assert.fail('Update mod with existing dependency failed');
    }
    assert.strictEqual(installedMods.length, 2, 'Update mod with existing dependency failed another wrong way');

    await sfInstall.installMod('dummyMod1', '1.0.2');
    installedMods = await sfInstall.getInstalledMods();
    if (installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.2')) {
      assert.fail('Update mod with conflicting SML version succeeded');
    }
    assert.strictEqual(installedMods.length, 2, 'Update mod with conflicting SML version failed the wrong way');

    await sfInstall.installMod('dummyMod1', '1.0.3');
    installedMods = await sfInstall.getInstalledMods();
    if (!installedMods.some((mod) => mod.mod_id === 'dummyMod1' && mod.version === '1.0.3')) {
      assert.fail('Update mod failed');
    }
    assert.strictEqual(installedMods.length, 2, 'Update mod failed the wrong way');
  } catch (e) {
    console.error(e);
  } finally {
    fs.rmdirSync(installPath, { recursive: true });
    fs.rmdirSync(getManifestFilePath(installPath), { recursive: true });
    await removeDummyMods();
  }
}

main();