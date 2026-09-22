import { execa } from "execa"
import { expect, test } from "vitest"

test.skipIf(!process.env.REDPACT_APPLICATION_IMAGE)(
  "앱 실행 이미지는 서버 의존성과 Git을 제공하고 웹 빌드 도구와 설치 캐시는 포함하지 않는다",
  async () => {
    const result = await execa(
      "docker",
      [
        "run",
        "--rm",
        process.env.REDPACT_APPLICATION_IMAGE!,
        "node",
        "-e",
        `const fs = require('node:fs');
       const {createRequire} = require('node:module');
       const requireServer = createRequire('/app/app/server/package.json');
       console.log(JSON.stringify({
         server: !!requireServer.resolve('testcontainers'),
         git: require('node:child_process').execFileSync('git',['--version'],{encoding:'utf8'}).trim(),
         buildTools: fs.existsSync('/app/node_modules/@biomejs/biome'),
         webDependencies: fs.existsSync('/app/app/web/node_modules'),
         packageCache: fs.existsSync('/root/.local/share/pnpm/store'),
       }));`,
      ],
      { timeout: 30000 },
    )
    expect(JSON.parse(result.stdout)).toEqual({
      server: true,
      git: expect.stringMatching(/^git version /),
      buildTools: false,
      webDependencies: false,
      packageCache: false,
    })
  },
  45000,
)
