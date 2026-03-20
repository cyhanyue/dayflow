import AppKit
import WebKit

// MARK: - FloatieWebView
// Overrides acceptsFirstMouse so clicks register immediately without
// needing a first click to "activate" the nonactivatingPanel.
class FloatieWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

// MARK: - FloatiePanel

class FloatiePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var panel: FloatiePanel!
    var statusItem: NSStatusItem!

    private var dragStartScreen: NSPoint = .zero
    private var windowStartOrigin: NSPoint = .zero
    private var dragMonitors: [Any] = []

    // MARK: - Server URL (stored in UserDefaults)

    private var serverURL: String {
        UserDefaults.standard.string(forKey: "serverURL") ?? "http://localhost:3001"
    }

    @discardableResult
    private func promptForURL(prefill: Bool = false) -> String {
        let alert = NSAlert()
        alert.messageText = "Dayflow Server URL"
        alert.informativeText = "Enter the URL where Dayflow is running.\nLocal dev:   http://localhost:3001\nProduction:  https://your-app.up.railway.app"
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Use localhost")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        input.placeholderString = "https://your-app.up.railway.app"
        if prefill { input.stringValue = serverURL }
        alert.accessoryView = input
        alert.window.initialFirstResponder = input

        let response = alert.runModal()
        let chosen: String
        if response == .alertFirstButtonReturn {
            let trimmed = input.stringValue
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            chosen = trimmed.isEmpty ? "http://localhost:3001" : trimmed
        } else {
            chosen = "http://localhost:3001"
        }
        UserDefaults.standard.set(chosen, forKey: "serverURL")
        UserDefaults.standard.set(true, forKey: "serverURLConfirmed")
        return chosen
    }

    // MARK: - Launch at Login (LaunchAgent plist)

    private var launchAgentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/com.dayflow.floatie.plist")
    }

    private var isLaunchAtLoginEnabled: Bool {
        FileManager.default.fileExists(atPath: launchAgentURL.path)
    }

    @objc private func toggleLaunchAtLogin() {
        isLaunchAtLoginEnabled ? disableLaunchAtLogin() : enableLaunchAtLogin()
        rebuildMenu()
    }

    private func enableLaunchAtLogin() {
        // Use the path of the currently running executable so the plist
        // points to whichever binary (debug or release) was just built.
        let execPath = ProcessInfo.processInfo.arguments[0]
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
            <key>Label</key>
            <string>com.dayflow.floatie</string>
            <key>ProgramArguments</key>
            <array>
                <string>\(execPath)</string>
            </array>
            <key>RunAtLoad</key>
            <false/>
        </dict>
        </plist>
        """
        do {
            try plist.write(to: launchAgentURL, atomically: true, encoding: .utf8)
            runLaunchctl(["load", launchAgentURL.path])
        } catch {
            showAlert(title: "Could not enable Launch at Login", message: error.localizedDescription)
        }
    }

    private func disableLaunchAtLogin() {
        runLaunchctl(["unload", launchAgentURL.path])
        try? FileManager.default.removeItem(at: launchAgentURL)
    }

    @discardableResult
    private func runLaunchctl(_ args: [String]) -> Bool {
        let proc = Process()
        proc.launchPath = "/bin/launchctl"
        proc.arguments = args
        do { try proc.run(); proc.waitUntilExit(); return proc.terminationStatus == 0 } catch { return false }
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }

    // MARK: - App lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusBar()
        setupPanel()
        setupDragMonitor()

        // Prompt after UI is ready so the dialog isn't hidden behind setup.
        // Fires if URL has never been explicitly confirmed (covers first launch
        // and users who had localhost auto-stored from a previous dev run).
        DispatchQueue.main.async {
            if !UserDefaults.standard.bool(forKey: "serverURLConfirmed") {
                self.promptForURL(prefill: UserDefaults.standard.string(forKey: "serverURL") != nil)
                // Reload webview with whatever URL was just confirmed
                if let webView = self.panel.contentView?.subviews.compactMap({ $0 as? FloatieWebView }).first {
                    webView.load(URLRequest(url: URL(string: "\(self.serverURL)/timer")!))
                }
            }
        }
    }

    // MARK: - Drag monitor
    // WKWebView captures all mouse events, so we intercept at the app level.
    // Clicks are passed through (buttons work); drags move the window.
    func setupDragMonitor() {
        let downMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            guard let self, event.window === self.panel else { return event }
            self.dragStartScreen   = NSEvent.mouseLocation
            self.windowStartOrigin = self.panel.frame.origin
            return event
        }
        let dragMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDragged) { [weak self] event in
            guard let self, event.window === self.panel else { return event }
            let dx = NSEvent.mouseLocation.x - self.dragStartScreen.x
            let dy = NSEvent.mouseLocation.y - self.dragStartScreen.y
            if abs(dx) > 3 || abs(dy) > 3 {
                self.panel.setFrameOrigin(NSPoint(x: self.windowStartOrigin.x + dx,
                                                   y: self.windowStartOrigin.y + dy))
                return nil
            }
            return event
        }
        if let d = downMonitor { dragMonitors.append(d) }
        if let d = dragMonitor { dragMonitors.append(d) }
    }

    // MARK: - WKScriptMessageHandler — receives messages from the web page

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "floatie",
              let body = message.body as? [String: String] else { return }
        switch body["action"] {
        case "minimize":
            panel.orderOut(nil)
        case "resize":
            guard let h = body["height"].flatMap({ Double($0) }) else { break }
            let newHeight = CGFloat(h)
            var frame = panel.frame
            frame.origin.y += frame.size.height - newHeight
            frame.size.height = newHeight
            panel.setFrame(frame, display: true, animate: true)
        case "open":
            guard let urlStr = body["url"] else { break }
            openInBrowser(urlStr)
        default: break
        }
    }

    // MARK: - Open URL (focus existing browser tab, open fresh only if not found)

    private func openInBrowser(_ urlString: String) {
        guard let host = URL(string: urlString)?.host else {
            NSWorkspace.shared.open(URL(string: urlString)!)
            return
        }
        // AppleScript: look for an existing tab whose URL contains our host
        // and bring it to front. Try Chrome then Safari, fall back to NSWorkspace.
        let script = """
        set targetURL to "\(urlString)"
        set targetHost to "\(host)"

        try
            tell application "Google Chrome"
                repeat with w in windows
                    repeat with t in tabs of w
                        if URL of t contains targetHost then
                            set active tab index of w to index of t
                            set index of w to 1
                            activate
                            return
                        end if
                    end repeat
                end repeat
            end tell
        end try

        try
            tell application "Safari"
                repeat with w in windows
                    repeat with t in tabs of w
                        if URL of t contains targetHost then
                            set current tab of w to t
                            set index of w to 1
                            activate
                            return
                        end if
                    end repeat
                end repeat
            end tell
        end try

        open location targetURL
        """
        var error: NSDictionary?
        NSAppleScript(source: script)?.executeAndReturnError(&error)
        if error != nil, let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Status bar menu

    func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            if let image = NSImage(systemSymbolName: "timer", accessibilityDescription: "Dayflow Timer") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "⏱"
            }
        }
        statusItem.isVisible = true
        rebuildMenu()
    }

    func rebuildMenu() {
        let menu = NSMenu()

        menu.addItem(NSMenuItem(title: "Show Floatie", action: #selector(showPanel), keyEquivalent: ""))
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Change Server URL…", action: #selector(changeURL), keyEquivalent: ""))
        menu.addItem(.separator())

        let loginItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
        loginItem.state = isLaunchAtLoginEnabled ? .on : .off
        menu.addItem(loginItem)
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc func changeURL() {
        promptForURL(prefill: true)
        // Reload the webview with the new URL immediately
        if let webView = panel.contentView?.subviews.compactMap({ $0 as? FloatieWebView }).first {
            webView.load(URLRequest(url: URL(string: "\(serverURL)/timer")!))
        }
        // Update Launch at Login plist to use the new URL (path doesn't change, but rebuilds plist)
        if isLaunchAtLoginEnabled { enableLaunchAtLogin() }
    }

    // MARK: - Floating panel

    func setupPanel() {
        let width: CGFloat  = 360
        let height: CGFloat = 55

        let screen = NSScreen.main ?? NSScreen.screens[0]
        let x = screen.visibleFrame.maxX - width  - 20
        let y = screen.visibleFrame.maxY - height - 20

        panel = FloatiePanel(
            contentRect: NSRect(x: x, y: y, width: width, height: height),
            styleMask:   [.nonactivatingPanel, .borderless],
            backing:     .buffered,
            defer:       false
        )

        panel.level               = .floating
        panel.collectionBehavior  = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate   = false
        panel.backgroundColor     = .clear
        panel.isOpaque            = false
        panel.hasShadow           = true

        let container = NSView(frame: NSRect(origin: .zero, size: NSSize(width: width, height: height)))
        container.wantsLayer             = true
        container.layer?.cornerRadius    = 16
        container.layer?.masksToBounds   = true
        container.layer?.backgroundColor = NSColor.clear.cgColor
        panel.contentView = container

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "floatie")

        let webView = FloatieWebView(frame: container.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.wantsLayer = true
        webView.layer?.borderWidth = 0
        webView.layer?.backgroundColor = NSColor.clear.cgColor
        container.addSubview(webView)

        webView.load(URLRequest(url: URL(string: "\(serverURL)/timer")!))

        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func showPanel() {
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
}
