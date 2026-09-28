const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");

const legacyWindowBootstrap = `
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const sceneDelegate = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let context = URLContexts.first else {
      return
    }
    RCTLinkingManager.application(
      UIApplication.shared,
      open: context.url,
      options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}

`;

function patchAppDelegate(contents) {
  let patched = contents;

  if (!patched.includes("fileprivate var launchOptions")) {
    patched = patched.replace(
      "  var reactNativeFactory: RCTReactNativeFactory?\n",
      "  var reactNativeFactory: RCTReactNativeFactory?\n  fileprivate var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n",
    );
  }

  if (!patched.includes("self.launchOptions = launchOptions")) {
    patched = patched.replace(
      "  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
      "  ) -> Bool {\n    self.launchOptions = launchOptions\n\n    let delegate = ReactNativeDelegate()",
    );
  }

  patched = patched.replace(legacyWindowBootstrap, "");

  if (!patched.includes("class SceneDelegate: UIResponder, UIWindowSceneDelegate")) {
    patched = patched.replace("class ReactNativeDelegate", `${sceneDelegate}class ReactNativeDelegate`);
  }

  return patched;
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error("The iOS 27 scene lifecycle plugin requires a Swift AppDelegate.");
    }
    config.modResults.contents = patchAppDelegate(config.modResults.contents);
    return config;
  });
}

module.exports = withIosSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
