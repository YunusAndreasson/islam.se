Pod::Spec.new do |s|
  s.name = 'PrayerWidget'
  s.version = '1.0.0'
  s.summary = 'Presence of the islam.se prayer widget'
  s.author = 'islam.se'
  s.homepage = 'https://islam.se'
  s.license = 'MIT'
  s.source = { :git => 'https://github.com/YunusAndreasson/islam.se.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.framework = 'WidgetKit'
  s.source_files = '*.swift'
end
