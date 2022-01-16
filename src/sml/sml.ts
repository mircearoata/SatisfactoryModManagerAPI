import path from 'path';

export const SMLDLLFileName = 'UE4-SML-Win64-Shipping.dll';
export const SMLPakFileName = 'SML.pak';
export const SMLZipFileName = 'SML.smod';

export const SMLDLLRelativePath = path.join('loaders', SMLDLLFileName);
export const SMLPakRelativePath = path.join('loaders', SMLPakFileName);
export const SML3xRelativePath = path.join('FactoryGame', 'Mods', 'SML');
export const SML3xUPluginRelativePath = path.join(SML3xRelativePath, 'SML.uplugin');
