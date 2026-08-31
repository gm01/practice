import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = resolve(root, "PROJECT_STATUS.md");
const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const checkOnly = args.includes("--check");
const event = valueOf("--event") || "manual";
const deploymentVersion = valueOf("--deployment-version");
const deploymentUrl = valueOf("--deployment-url");

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
}

if (checkOnly) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "PROJECT_STATUS.md"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim()) {
    console.error("PROJECT_STATUS.md에 커밋되지 않은 변경이 있습니다. 문서를 커밋한 뒤 다시 푸시하세요.");
    process.exit(1);
  }
  console.log("PROJECT_STATUS.md 동기화 상태 확인 완료");
  process.exit(0);
}

const current = readFileSync(statusPath, "utf8");
const branch = git("branch", "--show-current") || "detached HEAD";
const timestamp = `${new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date())} KST`;
const previousVersion = current.match(/마지막 API 배포 버전: `([^`]+)`/)?.[1] ?? "기록 없음";
const previousDeploymentAt = current.match(/마지막 API 배포 시각: `([^`]+)`/)?.[1] ?? "기록 없음";
const previousUrl = current.match(/운영 API: `([^`]+)`/)?.[1] ?? "https://fc-online-lab-api.bebebe97.workers.dev";
const eventNames = { commit: "커밋", push: "푸시 검증", deploy: "API 배포", manual: "수동 동기화" };
const block = `<!-- AUTO_STATUS_START -->
- 마지막 자동 동기화: \`${timestamp}\`
- 동기화 이벤트: \`${eventNames[event] ?? event}\`
- 작업 브랜치: \`${branch}\`
- 문서 기준: 이 파일이 포함된 최신 Git 커밋 (정확한 해시는 \`git log -1 -- PROJECT_STATUS.md\`로 확인)
- 운영 API: \`${deploymentUrl || previousUrl}\`
- 마지막 API 배포 버전: \`${deploymentVersion || previousVersion}\`
- 마지막 API 배포 시각: \`${deploymentVersion ? timestamp : previousDeploymentAt}\`
<!-- AUTO_STATUS_END -->`;
const next = current.replace(/<!-- AUTO_STATUS_START -->[\s\S]*?<!-- AUTO_STATUS_END -->/, block);

if (next === current && !current.includes("<!-- AUTO_STATUS_START -->")) {
  throw new Error("PROJECT_STATUS.md에서 자동 상태 블록을 찾지 못했습니다.");
}
writeFileSync(statusPath, next);
console.log(`PROJECT_STATUS.md 업데이트 완료 (${eventNames[event] ?? event})`);
