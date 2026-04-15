import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    let darkBg = UIColor(red: 0.035, green: 0.035, blue: 0.043, alpha: 1.0)

    window = UIWindow(frame: UIScreen.main.bounds)
    window?.backgroundColor = darkBg

    factory.startReactNative(
      withModuleName: "MFExampleHost",
      in: window,
      launchOptions: launchOptions
    )

    // Set dark background on the root view controller and RCTRootView
    // to prevent white flash between launch screen and JS render
    if let rootVC = window?.rootViewController {
      rootVC.view.backgroundColor = darkBg
      for subview in rootVC.view.subviews {
        subview.backgroundColor = darkBg
      }
    }

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
