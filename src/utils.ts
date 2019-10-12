const JSZipAsync = () => import('jszip').then(p => p.default);
const sanitizeHtmlAsync  = () => import("sanitize-html").then(p => p.default);
const openpgpAsync = () => import('openpgp');
const binconvAsync = () => import('binconv');

export function readableBytesString(bytes: number, fractionDigits: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let n = 1;
  let prevBytes = bytes;
  for (const [idx, unit] of units.entries()) {
    n *= 1024;
    const div = bytes / n;
    if (div < 1 || idx === units.length - 1) {
      return `${prevBytes.toFixed(fractionDigits)}${unit}`;
    }
    prevBytes = div;
  }
  // NOTE: Never execute
  return '';
}

export function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.readAsText(blob);
    reader.onload = () => {
      resolve(reader.result as string);
    }
  });
}

export function baseAndExt(name: string): {baseName: string, ext: string} {
  const m = name.match(/(.*)(\..*?)$/);
  if (m === null) {
    return {baseName: '', ext: ''};
  } else {
    return {baseName: m[1], ext: m[2]};
  }
}

export async function zipFilesAsBlob(files: File[]): Promise<Blob> {
  const JSZip = await JSZipAsync();
  const zip = JSZip();
  const directory = zip.folder('files');
  for (const file of files) {
    // Name not-duplicate name
    const name: string = (() => {
      let name: string = file.name;
      let {baseName, ext} = baseAndExt(file.name);
      // Loop until the file name is new
      for (let n = 1; directory.file(name) !== null; n++) {
        name = `${baseName}__${n}${ext}`;
      }
      return name;
    })();
    // Add file
    directory.file(name, file);
  }
  return directory.generateAsync({type : "blob"});
}

function* range(start: number, end: number): Generator<number> {
  for(let i = start; i <= end; i++) {
    yield i;
  }
}

// Whether text or not. Besed on file (1) behavior
// (from: https://stackoverflow.com/a/7392391/2885946)
export function isText(array: Uint8Array): boolean {
  const textChars: ReadonlyArray<number> = [7, 8, 9, 10, 12, 13, 27, ...range(0x20, 0xff)];
  return array.every(e => textChars.includes(e));
}

// Sanitize html, allowing <a> tag
export async function sanitizeHtmlAllowingATag(dirtyHtml: string): Promise<string> {
  const sanitizeHtml = await sanitizeHtmlAsync();
  return sanitizeHtml(dirtyHtml, {
    allowedTags: ['a'],
    allowedAttributes: {
      'a': ['href', 'target']
    }
  });
}

export async function encrypt(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const openpgp = await openpgpAsync();
  // Encrypt with PGP
  const encryptResult = await openpgp.encrypt({
    message: openpgp.message.fromBinary(bytes),
    passwords: [password],
    armor: false
  });
  // Get encrypted
  const encrypted: Uint8Array =
    encryptResult.message.packets.write();
  return encrypted;
}

export async function decrypt(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const openpgp = await openpgpAsync();
  const plain = (await openpgp.decrypt({
    message: await openpgp.message.read(bytes),
    passwords: [password],
    format: 'binary'
  })).data as Uint8Array;
  return plain;
}
