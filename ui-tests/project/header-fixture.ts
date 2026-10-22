import { node } from "./target"

// 격리 앱에 리뷰용 기록을 준비한다. 실제 테스트 실행을 의미하지 않는다.
export async function createHeaderFixture({ allTabs = false } = {}) {
  return node<{ id: string; name: string; settingsSource: string; environmentId?: string }>(
    `
            import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
            import {randomUUID} from 'node:crypto';
            const {allTabs}=JSON.parse(process.argv[1]);
            const origin='http://127.0.0.1:54318';
            const project=await (await fetch(origin+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'/app',name:'Redpact'})})).json();
            const worktrees=await (await fetch(origin+'/api/projects/'+project.id+'/worktrees')).json();
            const worktree=worktrees.find(item=>item.projectRoot==='/app');
            if(!worktree) throw new Error('Header fixture worktree missing');
            const settingsPath='/app/.redpact/settings.json';
            const settingsSource=readFileSync(settingsPath,'utf8');
            const settings=JSON.parse(settingsSource);
            settings.playwright={...settings.playwright,directory:'ui-tests',service:'app',port:54320,
              targets:{...settings.playwright?.targets,'header-capture':{scope:'worktree',purpose:'capture',testMatch:['worktree/captures/header.spec.ts']}}};
            writeFileSync(settingsPath,JSON.stringify(settings));
            mkdirSync('/app/ui-tests/worktree/captures',{recursive:true});
            writeFileSync('/app/ui-tests/worktree/captures/header.spec.ts',"import {test} from '@playwright/test'; test('헤더 캡처', async()=>{});");
            const id=randomUUID();
            const directory='/tmp/redpact-e2e-state/playwright-runs';
            mkdirSync(directory,{recursive:true});
            writeFileSync(directory+'/'+id+'.json',JSON.stringify({version:1,id,target:'captures',purpose:'capture',scope:'worktree',worktreeId:worktree.id,projectId:project.id,projectRoot:'/app',revision:null,settings:{directory:'ui-tests',targets:{captures:{purpose:'capture',testMatch:['project/captures/**/*.spec.ts']}},service:'app',port:54318,viewport:{width:1920,height:1080}},selection:{services:['app'],select:{}},settingsDigest:'header-fixture',sourceDigest:'header-fixture',appDigest:'header-fixture',createdAt:new Date().toISOString(),state:'finished',outcome:'failed',cleanupError:'Retained header recovery fixture',before:{state:'unavailable',cases:[]},after:{state:'finished',outcome:'failed',cases:[]}}));

            let environmentId;
            if(allTabs) {
              const {createHash}=await import('node:crypto');
              const {environmentSchema}=await import('/app/app/server/dist/core/environment-schema.js');
              const {executionSettingsSchema}=await import('/app/app/server/dist/core/execution-settings.js');
              const {settingsSchema}=await import('/app/app/server/dist/core/settings-schema.js');
              const unit='app/server/test/shared-header-fixture.test.ts';
              const integration='e2e/tests/shared-header-fixture.test.ts';
              settings.unitTests={...(settings.unitTests??{dockerfile:'unit.Dockerfile',command:'pnpm test',cwd:'app/server'}),patterns:[...(settings.unitTests?.patterns??[]),unit]};
              settings.tests={...settings.tests,directory:'e2e/tests'};
              mkdirSync('/app/app/server/test',{recursive:true});
              mkdirSync('/app/e2e/tests',{recursive:true});
              writeFileSync('/app/'+unit,'import {test,expect} from "vitest"; test("공용 헤더 Unit 검증",()=>expect("unit-header-source").toBe("unit-header-source"));');
              writeFileSync('/app/'+integration,'import {test,expect} from "vitest"; test("공용 헤더 Integration 검증",()=>expect("integration-header-source").toBe("integration-header-source"));');
              writeFileSync(settingsPath,JSON.stringify(settings));
              environmentId=randomUUID();
              const time=new Date().toISOString();
              const environment=environmentSchema.parse({id:environmentId,requestId:randomUUID(),ownerId:randomUUID(),target:{projectId:project.id,worktreeId:worktree.id,projectRoot:'/app',checkoutRoot:'/app'},projectName:'redpact-'+environmentId,
                settings:executionSettingsSchema.parse({environment:{compose:{files:[]}},tests:{}}),specification:settingsSchema.parse(settings),selection:{services:['app'],select:{}},plan:{activeServices:['app'],excludedServices:[],bindings:{},prerequisites:{},reasons:{}},bundle:[],settingsDigest:createHash('sha256').update('[]').digest('hex'),inputDigest:'header-environment-fixture',state:'stopped',lifecycle:'run',runIds:[],resources:[],endpoints:{},services:[],errors:[],createdAt:time,updatedAt:time});
              mkdirSync('/tmp/redpact-e2e-state/environments',{recursive:true});
              writeFileSync('/tmp/redpact-e2e-state/environments/'+environmentId+'.json',JSON.stringify({version:1,data:environment}));
            }
            console.log(JSON.stringify({...project,settingsSource,environmentId}));
  `,
    { allTabs },
  )
}

export async function cleanupHeaderFixture(settingsSource: string, environmentId?: string) {
  await node(
    `
      import {writeFileSync,rmSync} from 'node:fs';
      const {settingsSource,environmentId}=JSON.parse(process.argv[1]);
      writeFileSync('/app/.redpact/settings.json',settingsSource);
      rmSync('/app/ui-tests/worktree/captures/header.spec.ts',{force:true});
      rmSync('/app/app/server/test/shared-header-fixture.test.ts',{force:true});
      rmSync('/app/e2e/tests/shared-header-fixture.test.ts',{force:true});
      if(environmentId) rmSync('/tmp/redpact-e2e-state/environments/'+environmentId+'.json',{force:true});
      console.log('null');
    `,
    { settingsSource, environmentId },
  )
}
