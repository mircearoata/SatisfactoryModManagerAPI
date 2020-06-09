export * from 'exiftool-vendored';

declare module 'exiftool-vendored'{
  interface Tags {
    ProductVersion: string;
  }
}
