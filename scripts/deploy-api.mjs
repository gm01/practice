import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const pendingChanges = git("status", "--porcelain", "--untracked-files=normal")
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.endsWith("bali-travel-notebook/"));
if (pendingChanges.length) {
  console.error("API 배포 전 추적 파일을 먼저 커밋하세요. 배포 버전과 Git 기록을 일치시키기 위해 배포를 중단합니다.");
  process.exit(1);
}

const wranglerEntry = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
const deployment = spawnSync(process.execPath, [wranglerEntry, "deploy"], {
  cwd: resolve(root, "apps/api"),
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
process.stdout.write(deployment.stdout ?? "");
process.stderr.write(deployment.stderr ?? "");
if (deployment.status !== 0) process.exit(deployment.status ?? 1);

const output = `${deployment.stdout ?? ""}\n${deployment.stderr ?? ""}`.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
const version = output.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1];
const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
if (!version || !url) {
  console.error("배포는 완료됐지만 버전 ID 또는 운영 주소를 읽지 못했습니다. PROJECT_STATUS.md를 수동 확인하세요.");
  process.exit(1);
}

execFileSync("node", ["scripts/update-project-status.mjs", "--event", "deploy", "--deployment-version", version, "--deployment-url", url], { cwd: root, stdio: "inherit" });
git("add", "PROJECT_STATUS.md");
const staged = spawnSync("git", ["diff", "--cached", "--quiet", "--", "PROJECT_STATUS.md"], { cwd: root });
if (staged.status !== 0) {
  execFileSync("git", ["commit", "--no-verify", "-m", `docs: record API deployment ${version.slice(0, 8)}`], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PROJECT_STATUS_SKIP_HOOK: "1" },
  });
  const branch = git("branch", "--show-current");
  execFileSync("git", ["push", "origin", branch], { cwd: root, stdio: "inherit", env: { ...process.env, PROJECT_STATUS_SKIP_PUSH_CHECK: "1" } });
}
console.log(`API 배포 및 PROJECT_STATUS.md 기록 완료: ${version}`);
