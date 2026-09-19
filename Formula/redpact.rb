class Redpact < Formula
  desc "Local development review with test execution evidence"
  homepage "https://github.com/wo658/redpact"
  url "https://github.com/wo658/redpact/releases/download/runtime-v0.1.0/redpact-0.1.0.tgz"
  sha256 "09f23b99acdeadaa9b4b2482481b91c7febd7660bd142aaed42f359ab34b134d"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--global", "--prefix", libexec, "--omit=dev",
                  "--ignore-scripts", "--no-audit", "--no-fund", buildpath
    bin.install_symlink libexec/"bin/redpact"
  end

  def caveats
    <<~EOS
      Start the server and bundled viewer:
        redpact serve --port 54321
      Open http://127.0.0.1:54321. Codex and Claude plugins connect to this port.
      Managed test execution requires Docker with Compose; Git operations need Git.
      This formula installs the CLI and web viewer, not the Tauri desktop app.
    EOS
  end

  test do
    assert_match "--port", shell_output("#{bin}/redpact serve --help")
  end
end
