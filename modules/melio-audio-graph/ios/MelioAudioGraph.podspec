require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MelioAudioGraph'
  s.version        = package['version']
  s.summary        = 'AVAudioEngine queue + EQ for Melio'
  s.description    = 'Gapless next-item priming and EQ insert behind the Melio player facade.'
  s.license        = 'MIT'
  s.author         = 'Melio'
  s.homepage       = 'https://github.com/local/melio'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/local/melio.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
