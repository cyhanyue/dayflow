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

    func applicationDidFinishLaunching(_ notification: Notification) {
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
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
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

        webView.load(URLRequest(url: URL(string: "http://localhost:3001/timer")!))

        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func showPanel() {
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
}
