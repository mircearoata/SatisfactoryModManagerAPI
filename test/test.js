const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { SatisfactoryInstall, getManifestFilePath } = require('../');
const ManifestHandler = require('../lib/manifest');

const installPath = path.join(__dirname, 'TestSatisfactoryInstall');

async function main() {
  fs.mkdirSync(installPath, { recursive: true });
  
  try {
    const sfInstall = new SatisfactoryInstall(installPath);
    let installedMods;
    
    await sfInstall.installMod('6nKYZmGkoJmx9Z', '0.3.0');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 1, 'Install without dependency failed');

    await sfInstall.uninstallMod('6nKYZmGkoJmx9Z');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 0, 'Uninstall without dependency failed');

    await sfInstall.installMod('DGiLzB3ZErWu2V', '1.2.1');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 2, 'Install with dependency failed');

    await sfInstall.uninstallMod('DGiLzB3ZErWu2V');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 0, 'Uninstall with dependency failed');

    await sfInstall.installMod('6nKYZmGkoJmx9Z', '0.3.0');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 1, '2nd install without dependency failed');

    await sfInstall.installMod('DGiLzB3ZErWu2V', '1.2.1');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 3, 'Install with dependency and other mods failed');

    await sfInstall.uninstallMod('6nKYZmGkoJmx9Z');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 2, 'Uninstall without dependency and other mods failed');
    
    await sfInstall.uninstallMod('DGiLzB3ZErWu2V');
    installedMods = await sfInstall.getInstalledMods();
    assert.strictEqual(installedMods.length, 0, 'Uninstall with dependency and other mods failed');
  } catch(e) {
    console.error(e);
  } finally {
    fs.rmdirSync(installPath, { recursive: true });
    fs.rmdirSync(getManifestFilePath(installPath), { recursive: true });
  }
}

main();