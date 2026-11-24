// Publishes a new version: npm run release -- 0.1.1
// Bumps every version file, commits, tags and pushes. GitHub Actions does the rest.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: npm run release -- 0.1.1");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("tag", "--list", `v${version}`)) {
  console.error(`The tag v${version} already exists.`);
  process.exit(1);
}

const editJson = (path) => {
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};
editJson("package.json");
editJson("package-lock.json");
editJson("src-tauri/tauri.conf.json");

const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
writeFileSync("src-tauri/Cargo.toml", cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`));
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
writeFileSync("src-tauri/Cargo.lock", cargoLock.replace(/(name = "nexora-pulse"\r?\nversion = ")[^"]+/, `$1${version}`));

git("add", "package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock");
git("commit", "-m", `Release v${version}`);
git("tag", `v${version}`);
git("push", "origin", "HEAD", `v${version}`);
console.log(`v${version} pushed. GitHub Actions is building the release.`);
