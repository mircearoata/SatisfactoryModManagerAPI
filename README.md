# Satisfactory Mod Manager API

API which handles installing and uninstallin Satisfactory mods, mod loader, and more.

### Features

* Find the Satisfactory game installed through multiple stores
* Easily install mods and their dependencies
* Checks for compatibility between mods, their dependencies, and the game version
* Independent mod profiles that can be exported/imported
* Files are cached so uninstalling and reinstalling a mod takes no time

### Examples

```typescript
import { getInstalls, createProfile } from 'satisfactory-mod-manager-api';
getInstalls().then(async ({ installs, invalidInstalls }) => {
  const gameInstall = installs[0];
  await gameInstall.installMod('AreaActions');            // Install the latest compatible version
  await gameInstall.installMod('RefinedPower', '1.0.0');  // Or a specific version
  
  await gameInstall.setProfile('vanilla');                // Mods cannot be installed in the vanilla profile 
  await gameInstall.installMod('UtilityMod');             // So this will throw an error
  
  await gameInstall.setProfile('modded');                 // Change back to the default "modded" profile
  createProfile('newProfile');                            // But other profiles can be created too, either empty
  createProfile('newProfile2', 'modded');                 // Or copying the contents of an existing one
  await gameInstall.setProfile('newProfile2');            // Switch to the newly created profile
  
  console.log(gameInstall.mods);                          // Print the list of installed mods (AreaActions)
  
  await gameInstall.disableMod('AreaActions');            // Now the list will be empty, since the mod
  console.log(gameInstall.mods);                          // is disabled, thus not in the game directory
});
```