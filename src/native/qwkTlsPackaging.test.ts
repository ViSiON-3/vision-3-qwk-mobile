/**
 * Packaging-consistency guard for the local qwk-tls Expo module: the pieces
 * autolinking relies on (expo-module.config.json ↔ native sources) must agree,
 * for BOTH platforms. Pure file assertions — runs in Node, no native build.
 */
import * as fs from 'fs';
import * as path from 'path';

const MODULE_DIR = path.join(__dirname, '..', '..', 'modules', 'qwk-tls');

function readConfig(): {
  platforms: string[];
  apple: { modules: string[] };
  android: { modules: string[] };
} {
  return JSON.parse(fs.readFileSync(path.join(MODULE_DIR, 'expo-module.config.json'), 'utf8'));
}

describe('qwk-tls module packaging', () => {
  it('declares both platforms for autolinking', () => {
    const config = readConfig();
    expect(config.platforms.sort()).toEqual(['android', 'apple']);
    expect(config.apple.modules).toEqual(['QwkTlsModule']);
    expect(config.android.modules).toEqual(['expo.modules.qwktls.QwkTlsModule']);
  });

  it('has a Kotlin module matching the declared class, named QwkTls', () => {
    const [fqcn] = readConfig().android.modules;
    const parts = fqcn.split('.');
    const className = parts[parts.length - 1];
    const file = path.join(
      MODULE_DIR,
      'android',
      'src',
      'main',
      'java',
      ...parts.slice(0, -1),
      `${className}.kt`
    );
    const source = fs.readFileSync(file, 'utf8');
    expect(source).toContain(`package ${parts.slice(0, -1).join('.')}`);
    expect(source).toContain(`class ${className} : Module()`);
    // The JS side resolves requireNativeModule('QwkTls') on every platform.
    expect(source).toContain('Name("QwkTls")');
    expect(source).toContain('Events("onDownloadProgress")');
  });

  it('gradle config uses the same namespace as the Kotlin package', () => {
    const gradle = fs.readFileSync(path.join(MODULE_DIR, 'android', 'build.gradle'), 'utf8');
    expect(gradle).toContain('namespace "expo.modules.qwktls"');
    expect(gradle).toContain('expo-module-gradle-plugin');
  });
});
