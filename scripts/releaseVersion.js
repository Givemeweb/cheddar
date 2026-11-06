#!/usr/bin/env node
/**
 * SatSale release tag and Android version code scheme.
 *
 * Tag:          satsale-vMAJOR.MINOR.PATCH
 * versionName:  MAJOR.MINOR.PATCH
 * versionCode:  MAJOR * 10000 + MINOR * 100 + PATCH
 *
 * The version code must increase for every release. MINOR and PATCH are
 * limited to 99 so the next component always carries cleanly.
 *
 * Run `node scripts/releaseVersion.js satsale-v1.2.3` to print the mapping,
 * or `node scripts/releaseVersion.js --self-test` to check the parser.
 */
const fs = require('node:fs');

const TAG_PATTERN = /^satsale-v(\d+)\.(\d+)\.(\d+)$/;
const MAX_ANDROID_VERSION_CODE = 2147483647;
const KNOWN_FLAGS = new Set(['--self-test', '--github-env']);

function parseReleaseTag(tag) {
  const match = TAG_PATTERN.exec(tag ?? '');

  if (!match) {
    throw new Error(
      `Tag "${tag}" is invalid. Use satsale-vMAJOR.MINOR.PATCH, for example satsale-v1.2.3.`,
    );
  }

  const [majorText, minorText, patchText] = match.slice(1);

  // Reject leading zeroes and components that lose precision through Number.
  // One release must have exactly one tag spelling.
  if (
    [majorText, minorText, patchText].some(
      (part) => String(Number(part)) !== part,
    )
  ) {
    throw new Error(
      `Tag "${tag}" must use canonical numeric components without leading zeroes or unsafe precision.`,
    );
  }

  const [major, minor, patch] = [majorText, minorText, patchText].map(Number);

  if (minor > 99 || patch > 99) {
    throw new Error(
      `Tag "${tag}" has a MINOR or PATCH above 99; bump MAJOR instead.`,
    );
  }

  const versionCode = major * 10000 + minor * 100 + patch;

  if (versionCode < 1 || versionCode > MAX_ANDROID_VERSION_CODE) {
    throw new Error(
      `Tag "${tag}" maps to version code ${versionCode}, outside the Android range 1..${MAX_ANDROID_VERSION_CODE}.`,
    );
  }

  return { version: `${major}.${minor}.${patch}`, versionCode };
}

function selfTest() {
  const assert = require('node:assert');

  assert.deepStrictEqual(parseReleaseTag('satsale-v1.2.3'), {
    version: '1.2.3',
    versionCode: 10203,
  });
  assert.deepStrictEqual(parseReleaseTag('satsale-v0.0.1'), {
    version: '0.0.1',
    versionCode: 1,
  });
  assert.deepStrictEqual(parseReleaseTag('satsale-v1.99.99'), {
    version: '1.99.99',
    versionCode: 19999,
  });
  assert.deepStrictEqual(parseReleaseTag('satsale-v214748.36.47'), {
    version: '214748.36.47',
    versionCode: MAX_ANDROID_VERSION_CODE,
  });
  assert.deepStrictEqual(parseReleaseTag('satsale-v10.0.1'), {
    version: '10.0.1',
    versionCode: 100001,
  });

  assert.throws(() => parseReleaseTag('v1.2.3'), /is invalid/);
  assert.throws(() => parseReleaseTag('satsale-v1.2'), /is invalid/);
  assert.throws(() => parseReleaseTag('satsale-v1.02.3'), /canonical/);
  assert.throws(() => parseReleaseTag('satsale-v01.2.3'), /canonical/);
  assert.throws(() => parseReleaseTag('satsale-v1.100.0'), /above 99/);
  assert.throws(() => parseReleaseTag('satsale-v0.0.0'), /outside the Android range/);
  assert.throws(
    () => parseReleaseTag('satsale-v214748.36.48'),
    /outside the Android range/,
  );
  assert.throws(
    () => parseReleaseTag('satsale-v214749.0.0'),
    /outside the Android range/,
  );

  console.log('releaseVersion self-test PASS');
}

function writeGitHubEnv(release) {
  const envFile = process.env.GITHUB_ENV;

  if (!envFile) {
    throw new Error('--github-env requires GITHUB_ENV to be set.');
  }

  const stat = fs.statSync(envFile, { throwIfNoEntry: false });

  if (!stat || !stat.isFile()) {
    throw new Error(
      `GITHUB_ENV "${envFile}" does not point to an existing file.`,
    );
  }

  fs.appendFileSync(
    envFile,
    `APP_VERSION=${release.version}\nAPP_VERSION_CODE=${release.versionCode}\n`,
  );
  console.log(
    `version ${release.version}, version code ${release.versionCode}`,
  );
}

function main(argv) {
  const unknownFlag = argv.find(
    (argument) => argument.startsWith('-') && !KNOWN_FLAGS.has(argument),
  );

  if (unknownFlag) {
    throw new Error(`Unknown option "${unknownFlag}".`);
  }

  if (argv.includes('--self-test')) {
    if (argv.length > 1) {
      throw new Error('--self-test does not take a tag.');
    }
    selfTest();
    return;
  }

  const tags = argv.filter((argument) => !argument.startsWith('-'));

  if (tags.length !== 1) {
    throw new Error(
      'Pass exactly one release tag, for example satsale-v1.2.3, or --self-test.',
    );
  }

  const release = parseReleaseTag(tags[0]);

  if (argv.includes('--github-env')) {
    writeGitHubEnv(release);
    return;
  }

  console.log(JSON.stringify({ tag: tags[0], ...release }));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Release version error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { parseReleaseTag, MAX_ANDROID_VERSION_CODE };
