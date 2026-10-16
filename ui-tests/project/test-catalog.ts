import { expect, type Page } from "@playwright/test"
import { http, node } from "./target"
import { openNavigation } from "./word-wrap"

export async function prepareTestCatalog(page: Page) {
  const root = await node<string>(`
    import {execFileSync} from 'node:child_process';
    import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
    const root=mkdtempSync('/tmp/test-catalog-');
    const git=(...args)=>execFileSync('git',['-C',root,'-c','core.hooksPath=/dev/null',...args]);
    git('init','-qb','main');git('config','user.name','Test');git('config','user.email','test@example.com');
    mkdirSync(root+'/.redpact');mkdirSync(root+'/acceptance');
    writeFileSync(root+'/unit.Dockerfile','FROM node:24');
    writeFileSync(root+'/.redpact/settings.json',JSON.stringify({tests:{directory:'acceptance'},unitTests:{dockerfile:'unit.Dockerfile',command:'node --version',patterns:['*.test.ts']}}));
    writeFileSync(root+'/.redpact/tracking.json',JSON.stringify({mainBranch:'main',hideMerged:false}));
    writeFileSync(root+'/unchanged.test.ts','// UNCHANGED_UNIT');
    writeFileSync(root+'/acceptance/unchanged.test.ts','// UNCHANGED_INTEGRATION');
    git('add','.');git('commit','-qm','baseline');git('checkout','-qb','feature');
    for (let i=0;i<210;i++) {
      const name='file-'+String(i).padStart(3,'0')+'.test.ts';
      writeFileSync(root+'/'+name,'// UNIT_SOURCE_'+i+'\\n');
      writeFileSync(root+'/acceptance/'+name,'// INTEGRATION_SOURCE_'+i+'\\n');
    }
    for (const prefix of ['', 'acceptance/']) {
      writeFileSync(root+'/'+prefix+'oversize.test.ts','x'.repeat(200001));
      writeFileSync(root+'/'+prefix+'binary.test.ts','a'+String.fromCharCode(0)+'b');
      symlinkSync(root+'/'+prefix+'file-000.test.ts',root+'/'+prefix+'symlink.test.ts');
    }
    console.log(JSON.stringify(root));
  `)
  const project = await http<{ id: string }>("/api/projects", "POST", { path: root })
  expect(project.status).toBe(201)
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:project", id)
    localStorage.setItem("redpact:language", "en")
  }, project.body.id)
  await page.goto("/")
  await openNavigation(page, "Tests")
  return project.body
}
