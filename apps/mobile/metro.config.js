const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const sharedRoot = path.resolve(workspaceRoot, "shared");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

// Mobile and desktop share calculation logic from the repository-level
// `shared` directory. Keep Metro's file scan focused on shared code and the
// workspace dependencies instead of crawling native build outputs and APIs.
config.watchFolders = [sharedRoot, workspaceNodeModules];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  workspaceNodeModules,
];

module.exports = config;
