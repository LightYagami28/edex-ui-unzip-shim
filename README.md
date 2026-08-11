# edex-ui-unzip-shim

Not a fork of `unzipper`. This is new, minimal code implementing only the
two entry points [app-builder-lib](https://github.com/electron-userland/electron-builder)
(electron-builder's internals) actually calls on `unzipper` -
`Open.file(file)` and `Parse({ forceStream: true })` - backed by
[yauzl](https://www.npmjs.com/package/yauzl) (used by VS Code and Electron
itself) instead.

## Why

Written for [edex-ui](https://github.com/LightYagami28/edex-ui) to remove
`unzipper` from the dependency tree entirely (see
[SNYK-JS-UNZIPPER-18365659](https://security.snyk.io/vuln/SNYK-JS-UNZIPPER-18365659)),
after confirming electron-builder only needs this narrow surface: enumerate
a zip's central directory (path + Unix mode bits), then stream each entry's
content out for extraction. `yauzl` implements the actual zip-format
parsing (untouched, upstream); this package only adapts the calling
convention app-builder-lib expects.

Verified against `app-builder-lib`'s real `extractZipStreaming()` logic
(files, nested directories, Unix file modes, and symlinks) with output
matching the original `unzipper`-based extraction byte-for-byte, and against
a Zip Slip path-traversal payload (rejected).

## Usage

Installed via edex-ui's `package.json` `overrides`, aliased under the
`unzipper` import name so `app-builder-lib`'s `require("unzipper")` resolves
here transparently - not published to npm as a general-purpose package.
