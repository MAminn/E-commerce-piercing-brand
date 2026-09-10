import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    {
      input: "./server",
      builder: "mkdist",
      ext: "js",
      outDir: "./build/server",
    },
    {
      input: "./shared",
      builder: "mkdist",
      outDir: "./build/shared",
      ext: "js",
    },
    {
      input: "./backend",
      builder: "mkdist",
      outDir: "./build/backend",
      ext: "js",
    }
  ],
  clean: true,
  outDir: "build",
  alias: {
    "#root/*": "./build/*",
  },
});
