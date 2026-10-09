// Ad-hoc signs the Mac app after it is packed.
// Apple silicon Macs refuse to run apps with no signature at all; an ad-hoc
// signature ("-") is free and is enough for the app to open after the
// first-launch "unidentified developer" approval. It is NOT Apple notarization.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (/-temp$/.test(context.appOutDir)) return; // per-arch halves of a universal build
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
