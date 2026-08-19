require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AirPlayRoutePicker'
  s.version        = package['version']
  s.summary        = 'AVRoutePickerView Expo module for Melofin'
  s.description    = 'Hosts AVRoutePickerView so Melofin can open the system AirPlay route picker.'
  s.license        = 'MIT'
  s.author         = 'Melofin'
  s.homepage       = 'https://github.com/local/melofin'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/local/melofin.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
