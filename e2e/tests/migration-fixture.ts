// Executes only in a disposable fixture process, through the public CLI and HTTP API.
export const migrationFixture = String.raw`
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {scenario,cli='/app/app/server/dist/cli.js'}=JSON.parse(process.argv[1]);
const root=mkdtempSync(join(tmpdir(),'redpact-migration-'));
const id=randomUUID(),owner=randomUUID(),worktree=randomUUID();
const record={version:1,data:{id,requestId:randomUUID(),ownerId:owner,
 target:{projectId:randomUUID(),worktreeId:worktree,projectRoot:root,checkoutRoot:root},
 projectName:'redpact-'+id,settings:{environment:{compose:{files:[]}},tests:{}},
 specification:{composeFiles:[],dependencies:{payments:{modes:{mock:{services:[],env:{app:{PAYMENTS_MODE:'mock'}}}},recommendation:{mode:'mock',reason:'fixture'}}}},
 selection:{services:['app'],select:{payments:'mock'}},plan:{activeServices:['app'],excludedServices:[],bindings:{},prerequisites:{},reasons:{},requiredSecrets:[]},
 bundle:[],settingsDigest:createHash('sha256').update('[]').digest('hex'),inputDigest:'unchanged-input',
 state:'stopped',lifecycle:'manual',runIds:[],resources:[],endpoints:{},services:[],errors:[],createdAt:'2026-09-19T00:00:00.000Z',updatedAt:'2026-09-19T00:00:00.000Z'}};
const migration='001-fixed-environment-settings';
const path=join(root,'environments',id+'.json');
const journal=join(root,'.migrations','completed.json');
const backup=join(root,'.migrations','backups',migration,'environments',id+'.json');
mkdirSync(join(root,'environments'));
mkdirSync(join(root,'projects'));mkdirSync(join(root,'worktrees'));
writeFileSync(join(root,'projects',record.data.target.projectId+'.json'),JSON.stringify({version:1,data:{id:record.data.target.projectId,name:'Migration fixture',createdAt:record.data.createdAt,location:{kind:'directory',root}}}));
writeFileSync(join(root,'worktrees',worktree+'.json'),JSON.stringify({version:1,data:{id:worktree,projectId:record.data.target.projectId,checkoutRoot:root,projectRoot:root,gitdir:null,createdAt:record.data.createdAt}}));
writeFileSync(join(root,'instance.json'),JSON.stringify({version:1,id:owner,createdAt:'2026-09-19T00:00:00.000Z'}));
const settings='{"server":{"port":0},"approval":"ask","projects":[]}\n';
writeFileSync(join(root,'settings.json'),settings);
if(scenario==='invalid') delete record.data.selection.select.payments;
const original=JSON.stringify(record);
writeFileSync(path,original);
if(scenario==='future') {mkdirSync(join(root,'.migrations'));writeFileSync(journal,JSON.stringify([migration,'999-future']));}
if(scenario==='resume') {
 mkdirSync(join(root,'.migrations','backups',migration,'environments'),{recursive:true});writeFileSync(backup,original);
 record.data.specification={services:['app'],composeFiles:[],dependencies:{payments:{kind:'mock',services:[],env:{app:{PAYMENTS_MODE:'mock'}}}}};writeFileSync(path,JSON.stringify(record));
}
async function start(){
 const child=spawn(process.execPath,[cli,'serve','--data-dir',root,'--port','0'],{env:{...process.env,REDPACT_DESKTOP_CONTROL:'1'},stdio:['pipe','pipe','pipe']});
 const exit=once(child,'exit');let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 let port;
 try{
 const deadline=Date.now()+15000;
 while(!port&&child.exitCode===null&&Date.now()<deadline){for(const line of output.split('\n')){try{const x=JSON.parse(line);if(x.desktop==='ready')port=x.port}catch{}}if(!port)await new Promise(r=>setTimeout(r,20));}
 let status=0,records=[];
 if(port){const response=await fetch('http://127.0.0.1:'+port+'/api/environments?worktreeId='+worktree);status=response.status;records=await response.json();child.stdin.write('shutdown\n');}
 else if(child.exitCode===null)child.kill();
 const [code]=await exit;return {status,records,code,output};
 }finally{child.stdin.end();if(child.exitCode===null&&child.signalCode===null)child.kill();await exit;}
}
try{
 const first=await start();const after=readFileSync(path,'utf8');const log=existsSync(journal)?readFileSync(journal,'utf8'):null;
 const second=first.status===200?await start():null;
 console.log(JSON.stringify({first,second,original,after,log,backup:existsSync(backup)?readFileSync(backup,'utf8'):null,
 unchangedAfterRestart:after===readFileSync(path,'utf8')&&log===(existsSync(journal)?readFileSync(journal,'utf8'):null),
 settingsUnchanged:settings===readFileSync(join(root,'settings.json'),'utf8'),locked:existsSync(join(root,'.writer.lock'))}));
}finally{rmSync(root,{recursive:true,force:true});}
`

export interface MigrationResult {
  first: {
    status: number
    records: { specification: { dependencies: Record<string, { kind: string }> } }[]
    code: number
    output: string
  }
  second: { status: number } | null
  original: string
  after: string
  log: string | null
  backup: string | null
  unchangedAfterRestart: boolean
  settingsUnchanged: boolean
  locked: boolean
}
