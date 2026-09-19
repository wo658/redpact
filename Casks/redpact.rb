cask "redpact" do
  arch arm: "aarch64.dmg", intel: "x64.zip"

  version "0.1.0"
  sha256 arm:   "749ed5e45ebf2fc0125ba5d9df7518a6b1dc4a54c47aa56958cab1ad69e1b89f",
         intel: "5549c3ff2514b1339fdb2afafe363de3666d67b11a08464c740ff18e71e52e28"

  url "https://github.com/wo658/redpact/releases/download/desktop-preview-v#{version}/Redpact_#{version}_#{arch}"
  name "Redpact"
  desc "Local development review and test evidence"
  homepage "https://github.com/wo658/redpact"

  depends_on macos: ">= 13.5"

  app "Redpact.app"

  caveats <<~EOS
    This preview is ad-hoc signed, not Apple notarized.
    macOS may require Open Anyway in System Settings > Privacy & Security.
    Quit other Redpact instances using port 54321 before opening the app.
    Updates are manual; settings and results are retained on uninstall.
  EOS
end
