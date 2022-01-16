import path from 'path';
import fs from 'fs';
import { debug } from '../logging';
import { bootstrapperRelativePath, bootstrapperDIARelativePath } from './bootstrapper';

export function getBootstrapperVersion(satisfactoryPath: string): string | undefined {
  return fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))
    ? '2.0.11'
    : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function installBootstrapper(version: string, satisfactoryPath: string): Promise<void> {
  throw new Error('SML 2.x is not supported');
}

export async function uninstallBootstrapper(satisfactoryPath: string): Promise<void> {
  const bootstrapperVersion = getBootstrapperVersion(satisfactoryPath);
  if (!bootstrapperVersion) {
    debug('No bootstrapper to uninstall');
    return;
  }
  debug('Uninstalling bootstrapper');
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperRelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperRelativePath));
  }
  if (fs.existsSync(path.join(satisfactoryPath, bootstrapperDIARelativePath))) {
    fs.unlinkSync(path.join(satisfactoryPath, bootstrapperDIARelativePath));
  }
}
