//
//  shingekinoshinkennApp.swift
//  shingekinoshinkenn
//
//  Created by Koki Takiguchi on 2026/05/30.
//

import SwiftUI
import SwiftData

@main
struct shingekinoshinkennApp: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Item.self,
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(sharedModelContainer)
    }
}
