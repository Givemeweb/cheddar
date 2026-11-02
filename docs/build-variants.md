# Build variants

One codebase produces two builds, selected by the `APP_VARIANT` environment
variable. Both variants use the same app name (`Cheddar`) and icon.

| | `APP_VARIANT=store` (default) | `APP_VARIANT=satsale` |
| --- | --- | --- |
| Android package | `com.cheddar.app` | `com.cheddar.app.bee` |
| iOS bundle id | `com.cheddar.app` | `com.cheddar.app.bee` |
| Payment provider | RevenueCat | SatSale (placeholder until ticket 03) |
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
