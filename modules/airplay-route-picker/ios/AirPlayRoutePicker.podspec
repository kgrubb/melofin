require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AirPlayRoutePicker'
  s.version        = package['version']
  s.summary        = 'AVRoutePickerView Expo module for Melio'
  s.description    = 'Hosts AVRoutePickerView so Melio can open the system AirPlay route picker.'
  s.license        = 'MIT'
  s.author         = 'Melio'
  s.homepage       = 'https://github.com/local/melio'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/local/melio.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
