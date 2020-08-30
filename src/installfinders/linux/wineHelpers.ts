import fs from 'fs';
import path from 'path';

export function setDllOverrides(winePrefix: string): void {
  // add xinput1_3 and msdia140 dll overrides
  let wineConfig = fs.readFileSync(path.join(winePrefix, 'user.reg'), { encoding: 'utf8' });
  const dllOverridesBegin = wineConfig.indexOf('[Software\\\\Wine\\\\DllOverrides]');
  const dllOverridesEnd = wineConfig.indexOf('\n\n', dllOverridesBegin);
  let dllOverridesSection = wineConfig.slice(dllOverridesBegin, dllOverridesEnd);
  if (!dllOverridesSection.includes('"xinput1_3"="native,builtin"')) {
    if (dllOverridesSection.includes('"xinput1_3"=')) {
      dllOverridesSection = dllOverridesSection.replace(/"xinput1_3"="(.+?)"/g, '"xinput1_3"="native,builtin"');
    } else {
      dllOverridesSection += '\n"xinput1_3"="native,builtin"';
    }
  }
  if (!dllOverridesSection.includes('"msdia140"="native,builtin"')) {
    if (dllOverridesSection.includes('"msdia140"=')) {
      dllOverridesSection = dllOverridesSection.replace(/"msdia140"="(.+?)"/g, '"msdia140"="native,builtin"');
    } else {
      dllOverridesSection += '\n"msdia140"="native,builtin"';
    }
  }
  wineConfig = wineConfig.slice(0, dllOverridesBegin) + dllOverridesSection + wineConfig.slice(dllOverridesEnd);
  fs.writeFileSync(path.join(winePrefix, 'user.reg'), wineConfig);
}
