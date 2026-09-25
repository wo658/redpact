import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node } from "./target"

test("CLI 시작 로그에 실제로 접속할 수 있는 뷰어 주소를 표시한다", async (context) => {
  const step = createSteps(context)
  const result = await step("별도 상태 폴더에서 실제 CLI를 임의 포트로 시작한다", () =>
    node<{ port: number; url?: string; status: number; output: string }>(
      String.raw`
        import {spawn} from 'node:child_process';
        import {mkdtempSync,rmSync} from 'node:fs';
        import {tmpdir} from 'node:os';
        import {join} from 'node:path';
        const root=mkdtempSync(join(tmpdir(),'redpact-startup-url-'));
        const child=spawn(process.execPath,['/app/app/server/dist/cli.js','serve','--data-dir',root,'--port','0'],{stdio:['ignore','pipe','pipe']});
        let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
        try{
          let ready;
          const deadline=Date.now()+15000;
          while(!ready&&child.exitCode===null&&Date.now()<deadline){
            for(const line of output.split('\n')){try{const event=JSON.parse(line);if(event.msg==='Redpact listening on loopback')ready=event;}catch{}}
            if(!ready)await new Promise(resolve=>setTimeout(resolve,20));
          }
          if(!ready)throw new Error('CLI did not start: '+output);
          const status=(await fetch('http://127.0.0.1:'+ready.port+'/api/health')).status;
          console.log(JSON.stringify({port:ready.port,url:ready.url,status,output}));
        }finally{
          child.kill('SIGTERM');
          await new Promise(resolve=>child.once('exit',resolve));
          rmSync(root,{recursive:true,force:true});
        }
      `,
    ),
  )
  await step("시작 로그의 주소가 실제 뷰어 서버 포트와 일치한다", () => {
    expect(result.status).toBe(200)
    expect(result.url, result.output).toBe(`http://127.0.0.1:${result.port}/`)
  })
})
