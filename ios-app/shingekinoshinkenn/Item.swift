//
//  Item.swift
//  shingekinoshinkenn
//
//  Created by Koki Takiguchi on 2026/05/30.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
