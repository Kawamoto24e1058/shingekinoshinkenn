//
//  HapticManager.swift
//  shingekinoshinkenn
//
//  CoreHaptics をラップし、デモ用の触覚パターンを再生する。
//  参考: WWDC21 "Practice Audio Haptic Design" (session 10278)
//

import Combine
import CoreHaptics
import os

/// CoreHaptics の `CHHapticEngine` を管理し、デモ用パターンを再生する。
///
/// - Note: ハプティクスは実機専用。シミュレータでは `supportsHaptics == false` となり、
///         再生は no-op になる（UI 側でボタンを無効化する想定）。
@MainActor
final class HapticManager: ObservableObject {

    /// 端末がハプティクスに対応しているか（実機の Taptic Engine 有無）。
    let supportsHaptics: Bool

    private var engine: CHHapticEngine?
    private let logger = Logger(subsystem: "shingekinoshinkenn", category: "Haptics")

    init() {
        supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
        prepareEngine()
    }

    // MARK: - Engine lifecycle

    /// エンジンを生成・起動する。中断やリセットからの復帰も自動で行う。
    private func prepareEngine() {
        guard supportsHaptics else { return }
        do {
            let engine = try CHHapticEngine()

            // システムがエンジンをリセットした場合（例: 別アプリの割り込み後）に再起動する。
            engine.resetHandler = { [weak self] in
                self?.logger.debug("Haptic engine reset; restarting.")
                try? self?.engine?.start()
            }

            // エンジンが停止した場合の理由をログに残す。
            engine.stoppedHandler = { [weak self] reason in
                self?.logger.debug("Haptic engine stopped: \(reason.rawValue, privacy: .public)")
            }

            try engine.start()
            self.engine = engine
        } catch {
            logger.error("Failed to start haptic engine: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Playback

    /// 指定したパターンを即時再生する。
    private func play(_ pattern: CHHapticPattern) {
        guard supportsHaptics, let engine else { return }
        do {
            try engine.start() // 停止していた場合に備えて再開（起動済みなら no-op）。
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            logger.error("Failed to play haptic pattern: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Demo patterns

    /// トランジェント: 鋭い単発のタップ。
    func playTransient() {
        let event = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
            ],
            relativeTime: 0
        )
        playEvents([event])
    }

    /// 連続: 約1秒持続するランブル。
    func playContinuous() {
        let event = CHHapticEvent(
            eventType: .hapticContinuous,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.7),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
            ],
            relativeTime: 0,
            duration: 1.0
        )
        playEvents([event])
    }

    /// 抜刀（合成）: 鞘走りの連続イベント → 末尾に斬撃の鋭いトランジェント。
    func playDraw() {
        // 鞘走り: 短く立ち上がり、鋭さを増しながら持続。
        let slide = CHHapticEvent(
            eventType: .hapticContinuous,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.6),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.4)
            ],
            relativeTime: 0,
            duration: 0.3
        )
        // 斬撃の「ジャキィン」: 最大強度・最大鋭さの単発。
        let slash = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
            ],
            relativeTime: 0.3
        )
        playEvents([slide, slash])
    }

    private func playEvents(_ events: [CHHapticEvent]) {
        guard supportsHaptics else { return }
        do {
            let pattern = try CHHapticPattern(events: events, parameters: [])
            play(pattern)
        } catch {
            logger.error("Failed to build haptic pattern: \(error.localizedDescription, privacy: .public)")
        }
    }
}
