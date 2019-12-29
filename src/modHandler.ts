import fs from 'fs';
import util from 'util';
import { Mod } from './mod';

import JSZip = require('jszip');

export async function getModFromZip(zipPath: string): Promise<Mod> {
  return util.promisify(fs.readFile)(zipPath)
    .then((data) => JSZip.loadAsync(data))
    .then((zip) => zip.file('data.json').async('text'))
    .then((data) => JSON.parse(data) as Mod);
}

export async function installMod(): Promise<void> {
  throw new Error('Not implemented');
}
