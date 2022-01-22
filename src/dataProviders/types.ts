export interface FicsitAppMod {
  id: string;
  name: string;
  mod_reference: string;
  short_description: string;
  full_description: string;
  logo: string;
  source_url: string;
  views: number;
  downloads: number;
  hotness: number;
  popularity: number;
  created_at: Date;
  last_version_date: Date;
  authors: Array<FicsitAppAuthor>;
  versions: Array<FicsitAppVersion>;
}

export interface FicsitAppVersion {
  mod_id: string;
  version: string;
  sml_version: string;
  changelog: string;
  downloads: number;
  stability: 'alpha' | 'beta' | 'release';
  created_at: Date;
  link: string;
  size: number;
  hash: string;
  dependencies: FicsitAppModVersionDependency[];
}

export interface FicsitAppAuthor {
  mod_id: string;
  user: FicsitAppUser;
  role: string;
}

export interface FicsitAppUser {
  username: string;
  avatar: string;
}

export interface FicsitAppModVersionDependency {
  mod_id: string;
  condition: string;
  optional: boolean;
}

export interface FicsitAppSMLVersion {
  id: string;
  version: string;
  satisfactory_version: number;
  stability: 'alpha' | 'beta' | 'release';
  link: string;
  changelog: string;
  date: Date;
  bootstrap_version: string;
}

export interface FicsitAppBootstrapperVersion {
  id: string;
  version: string;
  satisfactory_version: number;
  stability: 'alpha' | 'beta' | 'release';
  link: string;
  changelog: string;
  date: Date;
}
