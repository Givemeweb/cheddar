# Build variants

One codebase produces two builds, selected by the `APP_VARIANT` environment
variable. Both variants use the same app name (`Cheddar`) and icon.

| | `APP_VARIANT=store` (default) | `APP_VARIANT=satsale` |
| --- | --- | --- |
| Android package | `com.cheddar.app` | `com.cheddar.app.bee` |
| iOS bundle id | `com.cheddar.app` | `com.cheddar.app.bee` |
| Payment provider | RevenueCat | SatSale |
| Native payment module | `react-native-purchases` | none |
| Activation | Play Store | Zapstore / GitHub Releases |

## Commands

`APP_VARIANT` is read by the app config, Metro, and native autolinking, so it
must be set for every command that generates or builds the app. Use the npm
scripts, which set it for you:

```sh
# Generated native project (gitignored). --clean makes switching repeatable.
npm run prebuild:store
npm run prebuild:satsale

# Dev server
npm run start:store
npm run start:satsale

# Native run (builds the matching variant)
npm run android:store
npm run android:satsale
npm run ios:store
npm run ios:satsale
```

The default remains the store build when `APP_VARIANT` is unset.

The npm scripts use POSIX `VAR=value command` syntax. On Windows, set the
variable in the shell first, for example
`$env:APP_VARIANT="satsale"; npm run android`, or use PowerShell equivalents.

## How the variant is applied

- `app.config.js` sets the package identifiers, keeps the shared name/icon,
  and writes `extra.appVariant`.
- `metro.config.js` resolves `@payment-provider` to the RevenueCat selector or
  the SatSale provider. Only the selected provider, and therefore only its
  native SDK imports, enter the JS bundle.
- The same resolver swaps `@crypto-payment` between the Bitcoin purchase UI
  (`APP_VARIANT=satsale`) and a no-op stub (`APP_VARIANT=store`, the default).
  The store bundle therefore carries no Bitcoin copy or flow.
- `react-native.config.js` excludes `react-native-purchases` from Android and
  iOS autolinking when `APP_VARIANT=satsale`.

Because autolinking and the JS bundle both read `APP_VARIANT`, do not run
Gradle or Xcode directly from a shell where the variable is missing. Use the
scripts above, or export `APP_VARIANT` first.

## Verifying a variant

```sh
APP_VARIANT=satsale npx expo config --type public
APP_VARIANT=satsale npx expo-modules-autolinking react-native-config --platform android --json
APP_VARIANT=store npx expo export --platform android --output-dir /tmp/cheddar-store
```

## Release guardrail

`npm run guardrail` is the release gate for both variants. It exports the
Android release bundle for each variant and checks that:

- the store bundle has no SatSale provider and no Bitcoin payment copy;
- the store bundle still contains the RevenueCat provider, and the SatSale
  bundle still contains the Bitcoin flow;
- the SatSale bundle has no `cheddar_pro`, `$rc_lifetime`, or
  `RevenueCatProvider` code;
- Android and iOS autolinking includes `react-native-purchases` for the store
  build and excludes it for the SatSale build;
- the generated SatSale Android project has the right package id.

Pass `--gradle` to also resolve each variant's `releaseRuntimeClasspath`: the
store graph must include `react-native-purchases`, while the SatSale graph
must not include `react-native-purchases`, `com.revenuecat.purchases`, or
`com.android.billingclient`. This requires a Java/Android SDK setup, so the
release workflow uses `npm run guardrail -- --gradle`.

The bundle check matches SatSale and Bitcoin payment markers rather than the
bare word `bitcoin`, because Lucide and Expo ship icon names such as `Bitcoin`,
`LucideBitcoin`, and `currency_bitcoin` in every bundle. Any other `bitcoin`
text in the store bundle fails the check.

The guardrail generates each Android project in a temporary copy, so it does
not touch your local `android/` or `ios/` folders. The GitHub Actions APK
workflow runs the guardrail before `expo prebuild`, so every release build is
checked. The release pipeline and any local release build should do the same.
The paywall tests (`npm test`) cover the store price/buy/restore actions and
the SatSale Bitcoin-only flow.
