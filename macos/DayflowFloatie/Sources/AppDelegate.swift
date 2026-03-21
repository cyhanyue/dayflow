import AppKit
import WebKit

// MARK: - FloatieWebView
class FloatieWebView: WKWebView {
    var rightClickHandler: ((NSEvent) -> Void)?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func rightMouseDown(with event: NSEvent) {
        // Handle right-click natively instead of letting WKWebView show its menu
        rightClickHandler?(event)
    }
}

// MARK: - FloatiePanel
class FloatiePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var panel: FloatiePanel!
    private var dragStartScreen: NSPoint = .zero
    private var windowStartOrigin: NSPoint = .zero
    private var dragMonitors: [Any] = []

    // MARK: - Server URL

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

    // MARK: - Launch at Login

    private var launchAgentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/com.dayflow.floatie.plist")
    }

    private var isLaunchAtLoginEnabled: Bool {
        FileManager.default.fileExists(atPath: launchAgentURL.path)
    }

    private func enableLaunchAtLogin() {
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

    // MARK: - URL Scheme (dayflow://show)
    // Must be registered in willFinishLaunching so the event isn't missed on cold launch.

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURL(_:withReplyEvent:)),
            forEventClass: AEEventClass(0x4755524C), // kInternetEventClass
            andEventID:    AEEventID(0x4755524C)     // kAEGetURL
        )
    }

    @objc func handleGetURL(_ event: NSAppleEventDescriptor, withReplyEvent: NSAppleEventDescriptor) {
        guard let urlStr = event.paramDescriptor(forKeyword: 0x2D2D2D2D)?.stringValue, // keyDirectObject
              URL(string: urlStr)?.scheme == "dayflow" else { return }
        // If launched cold via URL scheme, panel is set up in applicationDidFinishLaunching
        // and shown automatically. Only call showPanel() if the app was already running.
        if panel != nil { showPanel() }
    }

    // MARK: - App lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupPanel()
        setupDragMonitor()

        DispatchQueue.main.async {
            if !UserDefaults.standard.bool(forKey: "serverURLConfirmed") {
                self.promptForURL(prefill: UserDefaults.standard.string(forKey: "serverURL") != nil)
                if let webView = self.panel.contentView?.subviews.compactMap({ $0 as? FloatieWebView }).first {
                    webView.load(URLRequest(url: URL(string: "\(self.serverURL)/timer")!))
                }
            }
        }
    }

    // MARK: - Drag + right-click monitors

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
        [downMonitor, dragMonitor].compactMap { $0 }.forEach { dragMonitors.append($0) }
    }

    private func showContextMenu(at event: NSEvent) {
        let menu = NSMenu()

        let changeItem = NSMenuItem(title: "Change Server URL…", action: #selector(changeURL), keyEquivalent: "")
        changeItem.target = self
        menu.addItem(changeItem)

        menu.addItem(.separator())

        let loginItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
        loginItem.target = self
        loginItem.state = isLaunchAtLoginEnabled ? .on : .off
        menu.addItem(loginItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit Floatie", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        menu.addItem(quitItem)

        if let view = panel.contentView {
            NSMenu.popUpContextMenu(menu, with: event, for: view)
        }
    }

    @objc private func changeURL() {
        promptForURL(prefill: true)
        if let webView = panel.contentView?.subviews.compactMap({ $0 as? FloatieWebView }).first {
            webView.load(URLRequest(url: URL(string: "\(serverURL)/timer")!))
        }
        if isLaunchAtLoginEnabled { enableLaunchAtLogin() }
    }

    @objc private func toggleLaunchAtLogin() {
        isLaunchAtLoginEnabled ? disableLaunchAtLogin() : enableLaunchAtLogin()
    }

    // MARK: - WKScriptMessageHandler

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
        case "quit":
            NSApp.terminate(nil)
        default: break
        }
    }

    // MARK: - Open URL

    private func openInBrowser(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        NSWorkspace.shared.open(url)
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
        webView.rightClickHandler = { [weak self] event in
            self?.showContextMenu(at: event)
        }
        container.addSubview(webView)

        webView.load(URLRequest(url: URL(string: "\(serverURL)/timer")!))

        panel.orderFrontRegardless()
        if #available(macOS 14.0, *) { NSApp.activate() } else { NSApp.activate(ignoringOtherApps: true) }
    }

    @objc func showPanel() {
        panel.makeKeyAndOrderFront(nil)
        if #available(macOS 14.0, *) { NSApp.activate() } else { NSApp.activate(ignoringOtherApps: true) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
}
