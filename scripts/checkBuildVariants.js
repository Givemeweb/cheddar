#!/usr/bin/env node
/**
 * Build variant guardrail (ticket 06).
 *
 * Proves the two release builds contain the code they should:
 * - the store JS bundle has no SatSale provider and no Bitcoin payment copy
 * - the SatSale JS bundle has no RevenueCat native module or initialization
 * - store autolinking keeps react-native-purchases, SatSale autolinking drops it
 * - the SatSale generated Android project has no Play Billing reference
 *
 * Run with `npm run guardrail`. Add `--gradle` to resolve the native dependency
 * graphs too. CI runs `npm run guardrail -- --gradle` before every release
 * build.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAppVariant } = require('./appVariant');

const ROOT = path.resolve(__dirname, '..');
const EXPO_CLI = require.resolve('expo/bin/cli');
const EXPO_PACKAGE = require.resolve('expo/package.json');
// autolinking is a transitive dependency of expo, so resolve it from expo's
// location instead of assuming npm hoisted it to the project root.
const AUTOLINKING_CLI = require.resolve(
  'expo-modules-autolinking/bin/expo-modules-autolinking.js',
  { paths: [path.dirname(EXPO_PACKAGE)] },
);
const CHILD_TIMEOUT_MS = 20 * 60 * 1000;
const RUN_GRADLE = process.argv.includes('--gradle');

// Markers that only exist in the SatSale module or its Bitcoin copy. Do not
// use the bare word "Bitcoin": Lucide and Expo symbol tables ship icon names
// like "Bitcoin", "LucideBitcoin", and "currency_bitcoin" in every bundle.
// Keep only distinctive literals from the SatSale module. These are
// intentionally narrow: a false positive means shared code grew a SatSale
// concept, which should be reviewed rather than silently shipped.
const STORE_FORBIDDEN_MARKERS = [
  'satsale',
  'paywall-bitcoin',
  'bitcoin-payment-',
  'Bitcoin payment',
  'Bitcoin address',
  'Pay with Bitcoin',
  'Bitcoin sales are final',
  'createInvoice',
  'restoreLicense',
  'licenseFormatted',
  'normalizeLicense',
  'SatSaleApiError',
];

// Markers that only exist in the RevenueCat provider. The shared i18n file
// still contains the store purchase copy, so the SatSale build is allowed to
// mention RevenueCat in text; it must not import or initialize the SDK.
// `cheddar_pro` and `$rc_lifetime` are RevenueCat-only literals that survive
// minification, unlike a `.configure` call on a mangled import.
const SATSALE_FORBIDDEN_MARKERS = [
  'cheddar_pro',
  '$rc_lifetime',
  'RevenueCatProvider',
];

// Positive controls: a broken variant swap must fail, not silently pass by
// producing a bundle with neither provider.
const STORE_REQUIRED_MARKERS = ['cheddar_pro', '$rc_lifetime'];
const SATSALE_REQUIRED_MARKERS = ['Pay with Bitcoin', 'bitcoin-payment-'];

const SKIPPED_TOP_LEVEL = new Set([
  'node_modules',
  'android',
  'ios',
  '.git',
  '.expo',
  'dist',
  'build',
  '.archive',
]);

function run(command, args, { cwd = ROOT, variant, shell = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    shell,
    env: {
      ...process.env,
      APP_VARIANT: variant,
      EXPO_NO_TELEMETRY: '1',
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: CHILD_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (result.error || result.status !== 0) {
    const detail = result.error
      ? `${result.error.code ?? 'error'}: ${result.error.message}`
      : `exit ${result.status}`;
    throw new Error(
      `\`${command} ${args.join(' ')}\` failed (${detail}${
        result.signal ? `, signal ${result.signal}` : ''
      })\n${output.slice(-8000)}`,
    );
  }

  return result.stdout;
}

function readBundle(outputDir, platform = 'android') {
  const bundleDir = path.join(outputDir, '_expo', 'static', 'js', platform);
  if (!fs.existsSync(bundleDir)) {
    throw new Error(`No ${platform} JS bundle found in ${bundleDir}`);
  }

  const files = fs.readdirSync(bundleDir).filter((file) => file.endsWith('.js'));

  if (files.length === 0) {
    throw new Error(`No ${platform} JS bundle found in ${bundleDir}`);
  }

  return files
    .map((file) => fs.readFileSync(path.join(bundleDir, file), 'utf8'))
    .join('\n');
}

function exportBundle(variant) {
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `cheddar-guard-${variant}-`),
  );

  try {
    run(
      process.execPath,
      [
        EXPO_CLI,
        'export',
        '--platform',
        'android',
        '--no-bytecode',
        '--clear',
        '--output-dir',
        outputDir,
      ],
      { variant },
    );
    return readBundle(outputDir);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function findMarkers(bundle, markers) {
  const haystack = bundle.toLowerCase();
  return markers.filter((marker) =>
    haystack.includes(marker.toLowerCase()),
  );
}

function assertNoMarkers(bundle, markers, label) {
  const found = findMarkers(bundle, markers);
  if (found.length > 0) {
    throw new Error(`${label} contains forbidden markers: ${found.join(', ')}`);
  }
}

function assertMarkersPresent(bundle, markers, label) {
  const present = findMarkers(bundle, markers);
  const missing = markers.filter((marker) => !present.includes(marker));
  if (missing.length > 0) {
    throw new Error(`${label} is missing expected markers: ${missing.join(', ')}`);
  }
}

/**
 * The store bundle may only contain "bitcoin" as a bundled icon name. Strip
 * the exact emitted icon forms first, then reject any remaining occurrence.
 * Payment copy next to an icon table therefore still fails.
 */
function stripBitcoinIcons(bundle) {
  return bundle
    .replace(
      /Object\.defineProperty\(([A-Za-z_$][\w$]*),\s*["']Bitcoin["']/g,
      'Object.defineProperty($1,',
    )
    .replace(/["']Bitcoin["'](?=\s*,\s*\[\s*\[\s*["']path["'])/g, '')
    .replace(/["']BitcoinIcon["']/g, '')
    .replace(/["']LucideBitcoin["']/g, '')
    .replace(/\bcurrency_bitcoin\b/g, '');
}

function assertBitcoinIsIconOnly(bundle) {
  const remaining = stripBitcoinIcons(bundle);
  const matches = [];
  const pattern = /bitcoin/gi;
  let match;

  while ((match = pattern.exec(remaining)) !== null) {
    matches.push(
      remaining
        .slice(Math.max(0, match.index - 60), match.index + match[0].length + 60)
        .trim(),
    );
  }

  if (matches.length > 0) {
    throw new Error(
      `store bundle contains ${matches.length} Bitcoin payment text occurrence(s) outside icon names:\n${matches
        .slice(0, 5)
        .join('\n')}`,
    );
  }
}

function autolinkingDependencies(variant, platform) {
  const output = run(
    process.execPath,
    [
      AUTOLINKING_CLI,
      'react-native-config',
      '--platform',
      platform,
      '--json',
    ],
    { variant },
  );

  let config;
  try {
    config = JSON.parse(output);
  } catch {
    throw new Error(
      `autolinking returned non-JSON output for ${variant}/${platform}: ${output.slice(0, 500)}`,
    );
  }

  return Object.keys(config.dependencies ?? {});
}

function copyProjectToTemp() {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cheddar-guard-project-'),
  );

  try {
    fs.cpSync(ROOT, projectDir, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(ROOT, source);
        if (!relative) return true;
        const topLevel = relative.split(path.sep)[0];
        if (topLevel.startsWith('.env')) return false;
        return !SKIPPED_TOP_LEVEL.has(topLevel);
      },
    });

    // note: link node_modules instead of copying it; prebuild and Gradle only
    // read from it, and copying the tree would dominate the guardrail time.
    fs.symlinkSync(
      path.join(ROOT, 'node_modules'),
      path.join(projectDir, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    return projectDir;
  } catch (error) {
    fs.rmSync(projectDir, { recursive: true, force: true });
    throw error;
  }
}

function resolvedGradleDependencies(projectDir, variant) {
  const androidDir = path.join(projectDir, 'android');
  const gradlew = path.join(
    androidDir,
    process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
  );

  return run(
    gradlew,
    [
      ':app:dependencies',
      '--configuration',
      'releaseRuntimeClasspath',
      '--no-daemon',
      '--max-workers=2',
    ],
    { cwd: androidDir, variant, shell: process.platform === 'win32' },
  );
}

/** Generates the Android project in a temp copy so local native dirs stay put. */
function generateAndroidProject(variant, { checkGradle = false } = {}) {
  let projectDir;

  try {
    projectDir = copyProjectToTemp();

    run(
      process.execPath,
      [EXPO_CLI, 'prebuild', '--platform', 'android', '--no-install'],
      { cwd: projectDir, variant },
    );

    const gradleFile = path.join(projectDir, 'android', 'app', 'build.gradle');
    const gradle = fs.readFileSync(gradleFile, 'utf8');
    const packageMatch = gradle.match(/applicationId\s+['"]([^'"]+)['"]/);

    if (!packageMatch) {
      throw new Error(`No applicationId in the generated ${variant} project`);
    }

    return {
      applicationId: packageMatch[1],
      dependencies: checkGradle
        ? resolvedGradleDependencies(projectDir, variant)
        : null,
    };
  } finally {
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

function check(variant) {
  console.log(`Guardrail: ${variant} bundle`);
  const bundle = exportBundle(variant);

  if (variant === 'store') {
    assertNoMarkers(bundle, STORE_FORBIDDEN_MARKERS, 'store bundle');
    assertMarkersPresent(bundle, STORE_REQUIRED_MARKERS, 'store bundle');
    assertBitcoinIsIconOnly(bundle);
    console.log('  ✓ no SatSale provider or Bitcoin payment strings');
    console.log('  ✓ RevenueCat provider is present');
  } else {
    assertNoMarkers(bundle, SATSALE_FORBIDDEN_MARKERS, 'SatSale bundle');
    assertMarkersPresent(bundle, SATSALE_REQUIRED_MARKERS, 'SatSale bundle');
    console.log('  ✓ no RevenueCat native module or initialization');
    console.log('  ✓ Bitcoin payment flow is present');
  }

  console.log('Guardrail: native autolinking');
  for (const platform of ['android', 'ios']) {
    const dependencies = autolinkingDependencies(variant, platform);
    const linksRevenueCat = dependencies.includes('react-native-purchases');

    if (variant === 'store' && !linksRevenueCat) {
      throw new Error(
        `store ${platform} autolinking is missing react-native-purchases`,
      );
    }
    if (variant === 'satsale' && linksRevenueCat) {
      throw new Error(
        `SatSale ${platform} autolinking still links react-native-purchases`,
      );
    }
  }
  console.log(
    variant === 'store'
      ? '  ✓ store links react-native-purchases on Android and iOS'
      : '  ✓ SatSale links no react-native-purchases on Android or iOS',
  );

  console.log('Guardrail: generated Android project');
  const project = generateAndroidProject(variant, { checkGradle: RUN_GRADLE });
  const expectedPackage = resolveAppVariant(variant).package;

  if (project.applicationId !== expectedPackage) {
    throw new Error(
      `${variant} generated project uses "${project.applicationId}", expected "${expectedPackage}"`,
    );
  }

  if (variant === 'store' && project.dependencies) {
    if (!project.dependencies.includes('react-native-purchases')) {
      throw new Error(
        'store resolved dependencies are missing react-native-purchases',
      );
    }
  }

  if (variant === 'satsale' && project.dependencies) {
    const leaked = [
      'react-native-purchases',
      'com.revenuecat.purchases',
      'com.android.billingclient',
    ].filter((marker) => project.dependencies.includes(marker));

    if (leaked.length > 0) {
      throw new Error(
        `SatSale generated project resolves: ${leaked.join(', ')}`,
      );
    }
  }

  const gradleResult = project.dependencies
    ? variant === 'store'
      ? ' and resolves react-native-purchases'
      : ' without react-native-purchases or Play Billing'
    : '';

  console.log(
    `  ✓ package ${project.applicationId} generated${gradleResult}`,
  );
}

function main() {
  check('store');
  check('satsale');
  console.log('\nGuardrail PASS');
}

try {
  main();
} catch (error) {
  console.error(`\nGuardrail FAIL: ${error.message}`);
  process.exit(1);
}
