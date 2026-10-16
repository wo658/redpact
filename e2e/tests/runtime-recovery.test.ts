import { expect, test } from "vitest"
import { createSteps } from "./steps"
import { node } from "./target"

const fixture = String.raw`
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {ending}=JSON.parse(process.argv[1]);
const root=mkdtempSync(join(tmpdir(),'redpact-recovery-'));
const children=[];
async function start(){
 const child=spawn(process.execPath,['/app/app/server/dist/main.js','--data-dir',root,'--port','0'],{
 env:{...process.env,REDPACT_RUNTIME_SUPERVISED:'1',REDPACT_DESKTOP_CONTROL:''},stdio:['ignore','pipe','pipe','ipc']});
 const exit=once(child,'exit');children.push({child,exit});let output='';
 child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 const deadline=Date.now()+15000;let port;
 while(!port&&child.exitCode===null&&Date.now()<deadline){port=/"port":(\d+)/.exec(output)?.[1];if(!port)await new Promise(r=>setTimeout(r,20));}
 if(!port)throw new Error('Runtime not ready: '+output);
 const health=await fetch('http://127.0.0.1:'+port+'/api/health');
 return {child,exit,status:health.status};
}
try{
 const first=await start();const identity=readFileSync(join(root,'instance.json'),'utf8');
 if(ending==='disconnect')first.child.disconnect();else if(ending==='shutdown')first.child.send({runtimeControl:'shutdown'});else first.child.kill('SIGKILL');
 await first.exit;
 const second=await start();const preserved=identity===readFileSync(join(root,'instance.json'),'utf8');
 second.child.send({runtimeControl:'shutdown'});await second.exit;
 console.log(JSON.stringify({status:second.status,preserved,events:readFileSync(join(root,'runtime-lifecycle.jsonl'),'utf8').trim().split('\n').map(JSON.parse)}));
}finally{
 for(const {child,exit} of children){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exit;}
 rmSync(root,{recursive:true,force:true});
}
`

for (const ending of ["shutdown", "disconnect", "SIGKILL"]) {
  test(`런타임 ${ending} 뒤 수동 잠금 삭제 없이 동일 인스턴스를 복구한다`, async (context) => {
    const step = createSteps(context)
    const result = await step("실제 런타임을 종료하고 같은 데이터로 다시 시작한다", () =>
      node<{ status: number; preserved: boolean; events: Record<string, unknown>[] }>(fixture, {
        ending,
      }),
    )
    await step("복구 후 health와 인스턴스 식별자를 확인한다", () => {
      expect(result.status).toBe(200)
      expect(result.preserved).toBe(true)
    })
    await step("부모 연결과 독립적인 종료 또는 잠금 회수 기록을 확인한다", () => {
      if (ending === "SIGKILL") {
        expect(result.events).toContainEqual(
          expect.objectContaining({ event: "runtime.writer.recovered" }),
        )
      } else {
        expect(result.events).toContainEqual(
          expect.objectContaining({
            event: "runtime.shutdown.requested",
            reason: ending === "disconnect" ? "parent_disconnect" : "manual",
          }),
        )
      }
      expect(result.events).toContainEqual(
        expect.objectContaining({ event: "runtime.shutdown.completed", writer: "released" }),
      )
    })
  })
}
