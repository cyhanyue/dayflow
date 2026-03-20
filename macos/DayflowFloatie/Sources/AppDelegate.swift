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

    // Drag tracking
    private var dragStartScreen: NSPoint = .zero
    private var windowStartOrigin: NSPoint = .zero
    private var dragMonitors: [Any] = []

    // MARK: Server URL (stored in UserDefaults)

    private var serverURL: String {
        UserDefaults.standard.string(forKey: "serverURL") ?? "http://localhost:3001"
    }

    /// Shows a prompt asking the user for the server URL.
    /// Pass `prefill: true` to populate the text field with the current value (used for "Change URL…").
    @discardableResult
    private func promptForURL(prefill: Bool = false) -> String {
        let alert = NSAlert()
        alert.messageText = "Dayflow Server URL"
        alert.informativeText = "Enter the URL where Dayflow is running.\nExample: https://your-app.up.railway.app"
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
        return chosen
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ask for URL on very first launch (no stored value yet)
        if UserDefaults.standard.string(forKey: "serverURL") == nil {
            promptForURL()
        }
        setupStatusBar()
        setupPanel()
        setupDragMonitor()
    }

    // MARK: Drag monitor
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

    // MARK: WKScriptMessageHandler — receives messages from the web page
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
            // Keep top-left corner fixed when resizing
            frame.origin.y += frame.size.height - newHeight
            frame.size.height = newHeight
            panel.setFrame(frame, display: true, animate: true)
        case "open":
            guard let urlStr = body["url"], let url = URL(string: urlStr) else { break }
            NSWorkspace.shared.open(url)
        default: break
        }
    }

    // MARK: Status bar menu

    func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "⏱"

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Floatie", action: #selector(showPanel), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Change Server URL…", action: #selector(changeURL), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc func changeURL() {
        promptForURL(prefill: true)
        // Reload the webview with the new URL
        if let webView = panel.contentView?.subviews.compactMap({ $0 as? FloatieWebView }).first {
            webView.load(URLRequest(url: URL(string: "\(serverURL)/timer")!))
        }
    }

    // MARK: Floating panel

    func setupPanel() {
        let width: CGFloat  = 360   // matches in-app floating timer width exactly
        let height: CGFloat = 55    // 10px top pad + 32px divider + 10px bottom pad + 3px progress bar

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
        panel.backgroundColor     = .clear   // web content provides all colour
        panel.isOpaque            = false
        panel.hasShadow           = true

        let container = NSView(frame: NSRect(origin: .zero, size: NSSize(width: width, height: height)))
        container.wantsLayer             = true
        container.layer?.cornerRadius    = 16
        container.layer?.masksToBounds   = true
        container.layer?.backgroundColor = NSColor.clear.cgColor  // no dark bleed at corners
        panel.contentView = container

        // Register the "floatie" message handler so the web page can call native actions
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "floatie")

        // FloatieWebView — acceptsFirstMouse so buttons respond on first click
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
