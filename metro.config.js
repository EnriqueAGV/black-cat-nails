// La versión web (Next.js) vive en web/ con sus propias dependencias.
// Metro la ignora para que la app móvil no resuelva paquetes de esa carpeta.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const webDir = new RegExp(`^${__dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/web/.*`);
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : config.resolver.blockList ? [config.resolver.blockList] : []),
  webDir,
];

module.exports = config;
