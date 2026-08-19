require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MelofinAudioGraph'
  s.version        = package['version']
  s.summary        = 'Gapless/crossfade handoff and local EQ'
  s.description    = 'Secondary AVPlayer priming and a 10-band EQ tap on local playback.'
  s.license        = 'MIT'
  s.author         = 'Melofin'
  s.homepage       = 'https://github.com/local/melofin'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/local/melofin.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'AudioToolbox', 'MediaToolbox'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.public_header_files = 'MelofinEq.h'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
