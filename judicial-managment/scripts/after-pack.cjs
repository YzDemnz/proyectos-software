const fs = require('node:fs');
const path = require('node:path');

module.exports = async function applyWindowsBranding(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { rcedit } = await import('rcedit');
  const appInfo = context.packager.appInfo;
  const executablePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icons', 'icon.ico');

  if (!fs.existsSync(executablePath)) {
    throw new Error(`No se encontro el ejecutable para aplicar la marca: ${executablePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`No se encontro el icono de Windows: ${iconPath}`);
  }

  await rcedit(executablePath, {
    icon: iconPath,
    'file-version': appInfo.version,
    'product-version': appInfo.version,
    'version-string': {
      CompanyName: 'MI Legal',
      FileDescription: appInfo.productName,
      InternalName: appInfo.productFilename,
      LegalCopyright: `Copyright (c) ${new Date().getFullYear()} MI Legal`,
      OriginalFilename: `${appInfo.productFilename}.exe`,
      ProductName: appInfo.productName,
    },
  });

  console.log(`Marca de Windows aplicada a ${appInfo.productName} ${appInfo.version}.`);
};
