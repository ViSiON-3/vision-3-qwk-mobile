/**
 * Expo config plugin: raise every CocoaPods target to the app's iOS deployment
 * floor. Some pods (e.g. RNCAsyncStorage's resource bundle) still declare
 * iOS 13.4, which Xcode 26+ refuses to build ("supported deployment target
 * versions is 15.0 to ..."). The ios/ folder is generated, so the fix lives
 * here and is re-applied by `expo prebuild`.
 */
const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# [withPodMinDeploymentTarget]';
const SNIPPET = `
    ${MARKER} lift pod targets below the app floor so Xcode 26+ builds them
    min_ios = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '16.4')
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |bc|
        cur = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if cur.nil? || Gem::Version.new(cur) < min_ios
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_ios.to_s
        end
      end
    end
`;

module.exports = function withPodMinDeploymentTarget(config) {
  return withPodfile(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    const anchor = 'post_install do |installer|';
    const at = src.indexOf(anchor);
    if (at === -1) {
      throw new Error('withPodMinDeploymentTarget: Podfile has no post_install hook to extend');
    }
    const insertAt = at + anchor.length;
    cfg.modResults.contents = src.slice(0, insertAt) + SNIPPET + src.slice(insertAt);
    return cfg;
  });
};
