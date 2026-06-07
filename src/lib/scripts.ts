import { readFile } from "node:fs/promises";
import { join } from "node:path";

const readBrowserScript = async (filename: string) =>
  readFile(join(process.cwd(), "scripts", "browser", filename), "utf8");

export const loadDorf1Script = () => readBrowserScript("dorf1-script.js");
export const loadDorf2Script = () => readBrowserScript("dorf2-script.js");
export const loadBuildMenuScript = () => readBrowserScript("build-menu-script.js");
