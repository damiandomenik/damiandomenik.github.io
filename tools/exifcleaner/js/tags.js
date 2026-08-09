/* tags.js — which EXIF tags exist, and which of them are actually about you.
 *
 * The point of this tool is not to dump 200 tags. It is to say, in plain words,
 * what a photo gives away. So every tag carries a severity and, where it
 * matters, a sentence explaining the consequence.
 */

/** severity: 'critical' | 'high' | 'medium' | 'low' */
export const TAGS = {
  /* --- IFD0 --- */
  0x010e: { name: 'ImageDescription', group: 'identity', severity: 'medium' },
  0x010f: { name: 'Make', group: 'device', severity: 'medium' },
  0x0110: { name: 'Model', group: 'device', severity: 'medium' },
  0x0112: { name: 'Orientation', group: 'technical', severity: 'low', enum: 'orientation' },
  0x011a: { name: 'XResolution', group: 'technical', severity: 'low' },
  0x011b: { name: 'YResolution', group: 'technical', severity: 'low' },
  0x0128: { name: 'ResolutionUnit', group: 'technical', severity: 'low' },
  0x0131: { name: 'Software', group: 'software', severity: 'low' },
  0x0132: { name: 'ModifyDate', group: 'time', severity: 'high' },
  0x013b: { name: 'Artist', group: 'identity', severity: 'critical' },
  0x013e: { name: 'WhitePoint', group: 'technical', severity: 'low' },
  0x013f: { name: 'PrimaryChromaticities', group: 'technical', severity: 'low' },
  0x8298: { name: 'Copyright', group: 'identity', severity: 'high' },
  0x9c9b: { name: 'XPTitle', group: 'identity', severity: 'high', text: 'ucs2' },
  0x9c9c: { name: 'XPComment', group: 'identity', severity: 'high', text: 'ucs2' },
  0x9c9d: { name: 'XPAuthor', group: 'identity', severity: 'critical', text: 'ucs2' },
  0x9c9e: { name: 'XPKeywords', group: 'identity', severity: 'medium', text: 'ucs2' },
  0x9c9f: { name: 'XPSubject', group: 'identity', severity: 'medium', text: 'ucs2' },
  0x013c: { name: 'HostComputer', group: 'device', severity: 'medium' },
  0x000b: { name: 'ProcessingSoftware', group: 'software', severity: 'low' },

  /* --- Exif IFD --- */
  0x829a: { name: 'ExposureTime', group: 'camera', severity: 'low' },
  0x829d: { name: 'FNumber', group: 'camera', severity: 'low' },
  0x8822: { name: 'ExposureProgram', group: 'camera', severity: 'low' },
  0x8827: { name: 'ISO', group: 'camera', severity: 'low' },
  0x9000: { name: 'ExifVersion', group: 'technical', severity: 'low' },
  0x9003: { name: 'DateTimeOriginal', group: 'time', severity: 'high' },
  0x9004: { name: 'CreateDate', group: 'time', severity: 'high' },
  0x9010: { name: 'OffsetTime', group: 'time', severity: 'high' },
  0x9011: { name: 'OffsetTimeOriginal', group: 'time', severity: 'high' },
  0x9012: { name: 'OffsetTimeDigitized', group: 'time', severity: 'high' },
  0x9201: { name: 'ShutterSpeedValue', group: 'camera', severity: 'low' },
  0x9202: { name: 'ApertureValue', group: 'camera', severity: 'low' },
  0x9204: { name: 'ExposureCompensation', group: 'camera', severity: 'low' },
  0x9205: { name: 'MaxApertureValue', group: 'camera', severity: 'low' },
  0x9207: { name: 'MeteringMode', group: 'camera', severity: 'low' },
  0x9208: { name: 'LightSource', group: 'camera', severity: 'low' },
  0x9209: { name: 'Flash', group: 'camera', severity: 'low' },
  0x920a: { name: 'FocalLength', group: 'camera', severity: 'low' },
  0x927c: { name: 'MakerNote', group: 'device', severity: 'high' },
  0x9286: { name: 'UserComment', group: 'identity', severity: 'critical' },
  0xa002: { name: 'ExifImageWidth', group: 'technical', severity: 'low' },
  0xa003: { name: 'ExifImageHeight', group: 'technical', severity: 'low' },
  0xa402: { name: 'ExposureMode', group: 'camera', severity: 'low' },
  0xa403: { name: 'WhiteBalance', group: 'camera', severity: 'low' },
  0xa405: { name: 'FocalLengthIn35mmFormat', group: 'camera', severity: 'low' },
  0xa406: { name: 'SceneCaptureType', group: 'camera', severity: 'low' },
  0xa420: { name: 'ImageUniqueID', group: 'device', severity: 'critical' },
  0xa430: { name: 'OwnerName', group: 'identity', severity: 'critical' },
  0xa431: { name: 'BodySerialNumber', group: 'device', severity: 'critical' },
  0xa432: { name: 'LensInfo', group: 'camera', severity: 'low' },
  0xa433: { name: 'LensMake', group: 'device', severity: 'medium' },
  0xa434: { name: 'LensModel', group: 'device', severity: 'medium' },
  0xa435: { name: 'LensSerialNumber', group: 'device', severity: 'critical' },

  /* --- GPS IFD --- */
  0x0000: { name: 'GPSVersionID', group: 'location', severity: 'low' },
  0x0001: { name: 'GPSLatitudeRef', group: 'location', severity: 'critical' },
  0x0002: { name: 'GPSLatitude', group: 'location', severity: 'critical' },
  0x0003: { name: 'GPSLongitudeRef', group: 'location', severity: 'critical' },
  0x0004: { name: 'GPSLongitude', group: 'location', severity: 'critical' },
  0x0005: { name: 'GPSAltitudeRef', group: 'location', severity: 'high' },
  0x0006: { name: 'GPSAltitude', group: 'location', severity: 'high' },
  0x0007: { name: 'GPSTimeStamp', group: 'time', severity: 'high' },
  0x001d: { name: 'GPSDateStamp', group: 'time', severity: 'high' },
  0x0010: { name: 'GPSImgDirection', group: 'location', severity: 'medium' },
  0x0011: { name: 'GPSImgDirectionRef', group: 'location', severity: 'low' },
  0x001b: { name: 'GPSProcessingMethod', group: 'location', severity: 'medium' },
  0x0008: { name: 'GPSSatellites', group: 'location', severity: 'low' },
  0x0009: { name: 'GPSStatus', group: 'location', severity: 'low' },
  0x000c: { name: 'GPSSpeedRef', group: 'location', severity: 'low' },
  0x000d: { name: 'GPSSpeed', group: 'location', severity: 'medium' },
  0x0012: { name: 'GPSMapDatum', group: 'location', severity: 'low' },
  0x001f: { name: 'GPSHPositioningError', group: 'location', severity: 'medium' },
};

/** GPS tags live in their own IFD, so tag numbers collide with IFD0. */
export const GPS_TAGS = new Set([
  0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007,
  0x0008, 0x0009, 0x000c, 0x000d, 0x0010, 0x0011, 0x0012, 0x001b, 0x001d, 0x001f,
]);

export const ORIENTATION_LABELS = {
  1: 'Normal',
  2: 'Mirrored horizontally',
  3: 'Rotated 180°',
  4: 'Mirrored vertically',
  5: 'Mirrored and rotated 90° CCW',
  6: 'Rotated 90° CW',
  7: 'Mirrored and rotated 90° CW',
  8: 'Rotated 90° CCW',
};

/** Plain-language consequence for a whole group, shown once per group. */
export const GROUP_INFO = {
  location: {
    label: 'Location',
    icon: '📍',
    consequence: 'Pinpoints where the photo was taken, often to within a few metres. On a photo taken at home, this is your address.',
  },
  time: {
    label: 'Date & time',
    icon: '🕒',
    consequence: 'The exact second the shutter opened, including your time zone. Enough to place you somewhere at a specific moment.',
  },
  device: {
    label: 'Device',
    icon: '📷',
    consequence: 'Identifies the camera or phone. Serial numbers link every photo you have ever posted to the same device.',
  },
  identity: {
    label: 'Personal details',
    icon: '👤',
    consequence: 'Names, comments and descriptions written into the file — often your real name, added automatically by editing software.',
  },
  software: { label: 'Software', icon: '🛠', consequence: 'Which program last touched the file.' },
  camera: { label: 'Camera settings', icon: '⚙️', consequence: 'Exposure, aperture, ISO. Harmless on its own.' },
  technical: { label: 'Technical', icon: '📐', consequence: 'Dimensions, resolution, orientation. Harmless on its own.' },
  unknown: {
    label: 'Unrecognised tags',
    icon: '❓',
    consequence: 'Tags with no entry in this tool\u2019s dictionary — usually manufacturer extensions. Shown by their raw number so nothing stays hidden from you. They are removed along with everything else.',
  },
  thumbnail: {
    label: 'Embedded preview',
    icon: '🖼',
    consequence: 'A second, smaller copy of the image is stored inside the file. It is often the version from before you cropped or edited — so it can show what you removed.',
  },
  xmp: {
    label: 'XMP block',
    icon: '📄',
    consequence: 'An extra metadata packet, usually added by editing software. Frequently contains names, ratings, edit history and sometimes location.',
  },
  text: {
    label: 'Text chunks',
    icon: '💬',
    consequence: 'Free-text comments stored in the file. Contents vary; anything the writing program felt like recording.',
  },
};

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export const GROUP_ORDER = [
  'location', 'identity', 'thumbnail', 'time', 'device', 'xmp', 'text', 'software', 'camera', 'technical', 'unknown',
];
