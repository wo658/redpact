import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node } from "./target"

test("부모가 감독하는 웹 런타임이 웹 화면과 정상 종료를 함께 제공한다", async (context) => {
  const step = createSteps(context)
  const result = await step("격리된 앱에서 부모 IPC로 서버를 시작하고 웹 요청 후 종료한다", () =>
    node<{ status: number; html: string; exitCode: number; locked: boolean }>(`
    import {spawn} from 'node:child_process';import {once} from 'node:events';
    import {mkdtempSync,existsSync,rmSync} from 'node:fs';
    const data=mkdtempSync('/tmp/redpact-runtime-e2e-');
    const child=spawn(process.execPath,['/app/app/server/dist/cli.js','serve','--data-dir',data,'--port','0'],{env:{...process.env,REDPACT_RUNTIME_SUPERVISED:'1'},stdio:['ignore','pipe','pipe','ipc']});
    const exited=once(child,'exit');let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
    let port;child.on('message',message=>{if(message.runtimeReady)port=message.runtimeReady});
    try {
      const deadline=Date.now()+10000;
      while(!port&&child.exitCode===null&&Date.now()<deadline){await new Promise(r=>setTimeout(r,25))}
      if(!port)throw new Error('Runtime not ready: '+output);
      const response=await fetch('http://127.0.0.1:'+port+'/');const html=await response.text();
      child.send({runtimeControl:'shutdown'});const [exitCode]=await exited;
      console.log(JSON.stringify({status:response.status,html,exitCode,locked:existsSync(data+'/.writer.lock')}));
    } finally {if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;rmSync(data,{recursive:true,force:true})}
  `),
  )
  await step("React 웹 엔트리가 제공된다", () => {
    expect(result.status).toBe(200)
    expect(result.html).toContain('<div id="root">')
  })
  await step("정상 종료가 쓰기 잠금을 해제한다", () => {
    expect(result.exitCode).toBe(0)
    expect(result.locked).toBe(false)
  })
})
