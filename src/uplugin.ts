export interface UPlugin {
  Version: number;
  VersionName: string;
  SemVersion?: string;
  FriendlyName: string;
  Description: string;
  CreatedBy: string;
  CreatedByURL?: string;
  Plugins?: {
    Name: string;
    bOptional?: boolean;
    SemVersion?: string;
  }[];
}
