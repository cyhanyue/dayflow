// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DayflowFloatie",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "DayflowFloatie",
            path: "Sources"
        )
    ]
)
