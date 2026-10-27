'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../public/js/features/stage-layout.js')).toString('base64'));
test('composição mantém os recursos independentes e recupera destaque ao fechar painel',async()=>{
 const {planPanels}=await modulePromise;
 for(const screen of [false,true])for(const youtube of [false,true])for(const whiteboard of [false,true]){
  const plan=planPanels({screen,youtube,whiteboard,primary:'whiteboard',maximized:'youtube'});
  assert.equal(plan.active.includes('screen'),screen||(!youtube&&!whiteboard));
  assert.equal(plan.active.includes('youtube'),youtube);assert.equal(plan.active.includes('whiteboard'),whiteboard);
  assert.ok(plan.active.includes(plan.primary));assert.equal(plan.maximized,youtube?'youtube':null);
 }
 const plan=planPanels({screen:true,youtube:true,whiteboard:true,primary:'screen',maximized:'whiteboard'});
 assert.deepEqual(plan.active,['screen','youtube','whiteboard']);assert.equal(plan.primary,'screen');assert.equal(plan.maximized,'whiteboard');
});
