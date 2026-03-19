import AppKit
import WebKit

// MARK: - FloatiePanel
// Inspired by Helium's HeliumPanel — NSPanel subclass that:
//   • stays above all other windows (level = .floating)
//   • works across all Spaces and full-screen apps
//   • supports Cmd+drag to reposition (from Helium's sendEvent approach)

class FloatiePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    private var dragStart: NSPoint?

    override func sendEvent(_ event: NSEvent) {
        switch event.type {
        case .flagsChanged:
            if !event.modifierFlags.contains(.command) { dragStart = nil }
        case .leftMouseDown:
            if event.modifierFlags.contains(.command) { dragStart = event.locationInWindow }
        case .leftMouseUp:
            dragStart = nil
        case .leftMouseDragged:
            if let start = dragStart {
                let delta = NSPoint(x: start.x - event.locationInWindow.x,
                                    y: start.y - event.locationInWindow.y)
                setFrameOrigin(NSPoint(x: frame.origin.x - delta.x,
                                       y: frame.origin.y - delta.y))
                return
            }
        default:
            break
        }
        super.sendEvent(event)
    }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var panel: FloatiePanel!
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusBar()
        setupPanel()
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
        let width: CGFloat  = 380
        let height: CGFloat = 72

        // Default position: top-right corner of main screen
        let screen = NSScreen.main ?? NSScreen.screens[0]
        let x = screen.visibleFrame.maxX - width  - 20
        let y = screen.visibleFrame.maxY - height - 20

        panel = FloatiePanel(
            contentRect: NSRect(x: x, y: y, width: width, height: height),
            styleMask:   [.nonactivatingPanel, .borderless],
            backing:     .buffered,
            defer:       false
        )

        // Always-on-top: key lines borrowed from Helium's HeliumPanelController
        panel.level               = .floating
        panel.collectionBehavior  = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate   = false

        // Appearance — borderless + transparent so the timer's CSS gradient shows through
        panel.backgroundColor = .clear
        panel.isOpaque        = false
        panel.hasShadow       = true

        // Container view with rounded corners (matches the timer's border-radius: 16px)
        let container = NSView(frame: NSRect(origin: .zero,
                                             size: NSSize(width: width, height: height)))
        container.wantsLayer            = true
        container.layer?.cornerRadius   = 16
        container.layer?.masksToBounds  = true
        panel.contentView = container

        // WKWebView — transparent background so CSS gradient fills the window
        let webView = WKWebView(frame: container.bounds)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground") // Helium trick: transparent WebView
        container.addSubview(webView)

        webView.load(URLRequest(url: URL(string: "http://localhost:3001/timer")!))

        panel.makeKeyAndOrderFront(nil)
    }

    @objc func showPanel() {
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // Keep running when the panel is closed — status bar icon brings it back
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
}
