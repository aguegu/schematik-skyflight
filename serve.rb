#!/usr/bin/ruby
# Serve the prebuilt game on this Mac only. No Node, gems or developer tools needed.
require 'webrick'

root = File.expand_path('dist', __dir__)
abort 'Missing dist/index.html. Run npm run build, or copy the complete Skyflight release.' unless File.file?(File.join(root, 'index.html'))
port = Integer(ENV.fetch('SKYFLIGHT_PORT', '5178'))
server = WEBrick::HTTPServer.new(
  BindAddress: '127.0.0.1',
  Port: port,
  DocumentRoot: root,
  DirectoryIndex: ['index.html'],
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN),
  RequestCallback: proc { |_request, response|
    response['Cache-Control'] = 'no-cache'
    response['X-Content-Type-Options'] = 'nosniff'
  }
)
trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }
$stdout.sync = true
puts "Skyflight ready at http://localhost:#{port} — Ctrl+C to stop."
server.start
