import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(resolve(root, ".git"))) process.exit(0);

for (const name of ["pre-commit", "pre-push"]) {
  const path = resolve(root, ".githooks", name);
  if (existsSync(path)) chmodSync(path, 0o755);
}
execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root });
console.log("FC Online Lab Git 기록 자동화 훅 설치 완료");

