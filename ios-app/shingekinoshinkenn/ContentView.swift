//
//  ContentView.swift
//  shingekinoshinkenn
//
//  Created by Koki Takiguchi on 2026/05/30.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var haptics = HapticManager()

    var body: some View {
        VStack(spacing: 24) {
            Text("真剣 — 振動デモ")
                .font(.title.bold())

            Text("CoreHaptics の触覚パターンを再生します。")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(spacing: 16) {
                hapticButton("トランジェント（鋭い単発）", systemImage: "bolt.fill") {
                    haptics.playTransient()
                }
                hapticButton("連続（持続する震え）", systemImage: "waveform") {
                    haptics.playContinuous()
                }
                hapticButton("抜刀（うねり → ジャキィン）", systemImage: "scissors") {
                    haptics.playDraw()
                }
            }
            .disabled(!haptics.supportsHaptics)
            .opacity(haptics.supportsHaptics ? 1 : 0.4)

            if !haptics.supportsHaptics {
                Text("⚠️ この端末はハプティクスに対応していません。\n実機（iPhone）で実行してください。")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
    }

    private func hapticButton(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity)
                .padding()
        }
        .buttonStyle(.borderedProminent)
    }
}

#Preview {
    ContentView()
}
