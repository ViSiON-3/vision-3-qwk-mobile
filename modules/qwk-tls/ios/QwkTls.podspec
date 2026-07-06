Pod::Spec.new do |s|
  s.name           = 'QwkTls'
  s.version        = '0.1.0'
  s.summary        = 'TLS certificate-pinned HTTPS transport for the QWK Packet API'
  s.description    = 'Performs HTTPS requests that pin the server certificate SHA-256 fingerprint (trust-on-first-use, SSH-host-key style).'
  s.author         = 'ViSiON/3'
  s.homepage       = 'https://github.com/ViSiON-3/vision-3-qwk-mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.0'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
