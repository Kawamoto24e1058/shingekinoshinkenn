//
//  FirestoreConfig.swift
//  shingekinoshinkenn
//
//  Loads minimal Firestore REST settings from FirestoreConfig.plist.
//

import Foundation

struct FirestoreConfig {
    let projectId: String
    let apiKey: String
    let matchId: String
    let playerId: String

    static func load() throws -> FirestoreConfig {
        guard let url = Bundle.main.url(forResource: "FirestoreConfig", withExtension: "plist") else {
            throw FirestoreConfigError.missingFile
        }
        return try load(from: url)
    }

    static func load(from url: URL) throws -> FirestoreConfig {
        let data = try Data(contentsOf: url)
        return try decode(from: data)
    }

    static func decode(from data: Data) throws -> FirestoreConfig {
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)

        guard let dictionary = plist as? [String: Any] else {
            throw FirestoreConfigError.invalidFile
        }

        let projectId = (dictionary["FIRESTORE_PROJECT_ID"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let apiKey = (dictionary["FIRESTORE_API_KEY"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let matchId = (dictionary["FIRESTORE_MATCH_ID"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let playerId = (dictionary["FIRESTORE_PLAYER_ID"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let projectId, !projectId.isEmpty, projectId != "your-firebase-project-id" else {
            throw FirestoreConfigError.missingProjectId
        }
        guard let apiKey, !apiKey.isEmpty, apiKey != "your-web-api-key" else {
            throw FirestoreConfigError.missingAPIKey
        }

        return FirestoreConfig(
            projectId: projectId,
            apiKey: apiKey,
            matchId: matchId?.isEmpty == false ? matchId! : "test",
            playerId: playerId?.isEmpty == false ? playerId! : "p1"
        )
    }
}

enum FirestoreConfigError: LocalizedError {
    case missingFile
    case invalidFile
    case missingProjectId
    case missingAPIKey

    var errorDescription: String? {
        switch self {
        case .missingFile:
            return "FirestoreConfig.plist がアプリに入っていません"
        case .invalidFile:
            return "FirestoreConfig.plist の形式が正しくありません"
        case .missingProjectId:
            return "FIRESTORE_PROJECT_ID を設定してください"
        case .missingAPIKey:
            return "FIRESTORE_API_KEY を設定してください"
        }
    }
}
