"use strict";
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "test-results", "whiteboard");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tupi-browser-"));
  const server = spawn(process.execPath, [path.join(PROJECT_ROOT, "server.js")], { cwd: PROJECT_ROOT, env: { ...process.env, PORT: "3139", HOST: "127.0.0.1", BOARD_DATA_DIR: dir }, stdio: "pipe" });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) => reject(new Error("Servidor encerrou: " + code)));
    });
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
    const contexts = await Promise.all([browser.newContext({ acceptDownloads: true }), browser.newContext({ acceptDownloads: true })]);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (const [i, p2] of pages.entries()) {
      p2.setDefaultTimeout(7e3);
      await p2.goto("http://127.0.0.1:3139");
      await p2.evaluate(async (i2) => {
        const { Whiteboard } = await import("/js/features/whiteboard/index.js");
        document.querySelector("#whiteboard").remove();
        document.querySelector("#landing").classList.add("hidden");
        document.querySelector("#room").classList.remove("hidden");
        document.body.classList.add("in-room");
        document.querySelector(".screen-area").classList.add("hidden");
        window.b = new Whiteboard((m) => window.s.send(JSON.stringify(m)));
        window.messages = [];
        await new Promise((resolve) => {
          window.s = new WebSocket("ws://127.0.0.1:3139/signal");
          s.onopen = () => s.send(JSON.stringify({ type: "join", name: i2 ? "Beto" : "Ana" }));
          s.onmessage = (e) => {
            const m = JSON.parse(e.data);
            messages.push(m);
            b.handle(m);
            if (m.type === "board-state") resolve();
          };
        });
        b.open();
      }, i);
    }
    const [a, b] = pages;
    await a.waitForFunction(() => window.b.members?.length === 2);
    await a.evaluate(() => {
      b.tool = "rect";
      b.updateTools();
    });
    const box = await a.locator("#whiteboard svg").boundingBox();
    await a.mouse.move(box.x + 90, box.y + 90);
    await a.mouse.down();
    await a.mouse.move(box.x + 260, box.y + 190);
    await a.mouse.up();
    await b.waitForFunction(() => Object.keys(window.b.elements).length === 1);
    for (const kind of ["pen", "line", "arrow", "circle", "sticky", "text", "stamp"]) {
      await a.evaluate((kind2) => {
        b.tool = kind2;
        b.updateTools();
      }, kind);
      const area = await a.locator("#whiteboard svg").boundingBox();
      await a.mouse.move(area.x + 320, area.y + 90);
      await a.mouse.down();
      await a.mouse.move(area.x + 430, area.y + 170, { steps: 6 });
      await a.mouse.up();
      if (["text", "sticky"].includes(kind)) {
        await a.locator(".wb-editor").fill("Colaboração legível");
        await a.locator('[data-tool="select"]').click();
      }
      await a.waitForFunction(() => b.pending.size === 0);
    }
    await b.waitForFunction(() => Object.keys(window.b.elements).length === 8);
    await b.evaluate(() => {
      const e = Object.values(b.elements)[0];
      b.put(crypto.randomUUID(), { ...e, x: 700, text: "Outra pessoa" });
    });
    await a.waitForFunction(() => Object.keys(b.elements).length === 9);
    await a.evaluate(() => b.history(false));
    await b.waitForFunction(() => Object.keys(window.b.elements).length === 8);
    assert.ok(await a.evaluate(() => Object.values(b.elements).some((e) => e.author === "Beto")));
    await a.evaluate(() => b.history(true));
    await b.waitForFunction(() => Object.keys(window.b.elements).length === 9);
    await a.evaluate(() => {
      const member = b.members.find((m) => m.id !== b.user.id);
      b.send({ type: "board-permission", user: member.id, edit: false });
    });
    await b.waitForFunction(() => !window.b.user.edit);
    await b.evaluate(() => {
      const id = Object.keys(b.elements)[0];
      s.send(JSON.stringify({ type: "board-put", id, version: b.versions[id], element: null, request: "attack" }));
    });
    await b.waitForFunction(() => messages.some((m) => m.type === "board-error" && m.request === "attack"));
    assert.equal(await b.evaluate(() => Object.keys(window.b.elements).length), 9);
    await b.evaluate(() => s.send(JSON.stringify({ type: "board-get", room: "outra", request: "cross-room" })));
    await b.waitForFunction(() => messages.some((m) => m.type === "board-error" && m.request === "cross-room"));
    await a.evaluate(() => {
      b.close();
      b.open();
    });
    await a.waitForFunction(() => Object.keys(b.elements).length === 9);
    await b.evaluate(async () => {
      const token = sessionStorage.getItem("tupi-board-token");
      await new Promise((r) => {
        s.onclose = r;
        s.close();
      });
      await new Promise((r) => {
        window.s = new WebSocket("ws://127.0.0.1:3139/signal");
        s.onopen = () => s.send(JSON.stringify({ type: "join", boardToken: token, name: "Beto" }));
        s.onmessage = (e) => {
          const m = JSON.parse(e.data);
          messages.push(m);
          b.handle(m);
          if (m.type === "board-state") r();
        };
      });
    });
    assert.equal(await b.evaluate(() => Object.keys(window.b.elements).length), 9);
    assert.equal(await b.evaluate(() => window.b.user.edit), false);
    for (const format of ["png", "pdf"]) {
      const download = a.waitForEvent("download");
      await a.evaluate((format2) => b.export(format2), format);
      const d = await download;
      const file = await d.path();
      assert.ok(fs.statSync(file).size > 1e3);
      if (format === "pdf") assert.equal(fs.readFileSync(file).subarray(0, 8).toString(), "%PDF-1.4");
    }
    await a.locator('[data-action="fit"]').click();
    await a.screenshot({ path: path.join(OUTPUT_DIR, "whiteboard-validation.png"), animations: "disabled" });
    for (const c of contexts) await c.close();
    const actualContexts = await Promise.all([browser.newContext(), browser.newContext()]);
    for (const context of actualContexts) await context.addInitScript(() => {
      // Uma faixa real gerada por canvas exercita o transporte WebRTC sem seletor do SO.
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas');canvas.width=640;canvas.height=360;
        const ctx=canvas.getContext('2d');
        const draw=()=>{ctx.fillStyle='#243652';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='30px Arial';ctx.fillText('Tela compartilhada em andamento',30,100);ctx.fillText(String(Date.now()),30,180);};
        draw();const stream=canvas.captureStream(10);const timer=setInterval(draw,100);stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
      };
      // Player determinístico: o teste verifica continuidade sem depender da rede do YouTube.
      window.__playerDestroyed=0;
      window.YT={Player:class {
        constructor(id,options){this.time=0;this.state=2;this.started=Date.now();window.__testPlayer=this;const host=typeof id==='string'?document.getElementById(id):id;host.textContent='YouTube · reprodução de teste';host.style.color='white';setTimeout(()=>options.events.onReady(),0);}
        getCurrentTime(){return this.time+(this.state===1?(Date.now()-this.started)/1000:0);}
        getDuration(){return 600;}getPlayerState(){return this.state;}
        playVideo(){if(this.state!==1){this.started=Date.now();this.state=1;}}
        pauseVideo(){this.time=this.getCurrentTime();this.state=2;}
        seekTo(time){this.time=time;this.started=Date.now();}
        getAvailablePlaybackRates(){return [1];}setPlaybackRate(){}setVolume(){}mute(){}unMute(){}
        destroy(){window.__playerDestroyed++;}
      }};
    });
    const actualPages = await Promise.all(actualContexts.map((c) => c.newPage()));
    for (const p2 of actualPages) {
      await p2.goto("http://127.0.0.1:3139");
      await p2.locator("#lobbyJoinBtn").click();
    }
    for (const p2 of actualPages) {
      await p2.locator("#whiteboardBtn").click();
      await p2.waitForFunction(() => document.querySelectorAll("#whiteboard .wb-world > g[data-id]").length >= 9);
      assert.ok((await p2.locator("#wbStatus").textContent()).includes("salvo"));
    }
    const p = actualPages[0];
    assert.equal(await p.locator("#lobbyWhiteboardBtn").count(), 0);
    assert.deepEqual(await p.locator("#mediaModeSwitch").evaluate((el) => [...el.children].map((c) => c.id)), ["screenSettings", "youtubeToggleBtn", "whiteboardBtn"]);
    assert.equal(await p.locator("#whiteboard").evaluate((el) => getComputedStyle(el).position), "static");
    assert.equal(await p.locator("#whiteboard").evaluate((el) => el.parentElement.id), "stagePanel");
    await p.locator('[data-tool="text"]').click();
    assert.ok(await p.locator('[data-properties="text"]').isVisible());
    assert.equal(await p.locator('[data-properties="stroke"]').isVisible(), false);
    await p.locator('[data-tool="pen"]').click();
    assert.equal(await p.locator('[data-properties="text"]').isVisible(), false);
    assert.ok(await p.locator('[data-properties="stroke"]').isVisible());
    await p.locator('[data-action="shortcuts"]').click();
    assert.ok(await p.locator("#wbShortcutsDialog").evaluate((el) => el.open));
    assert.equal(await p.locator("#shortcutsDialog").evaluate((el) => el.open), false);
    assert.equal(await p.locator("#wbShortcutsDialog .shortcuts-list > div").count(), 9);
    await p.keyboard.press("Escape");
    await p.locator("#whiteboard svg").focus();
    await p.keyboard.press("t");
    assert.equal(await p.locator('[data-tool="text"]').getAttribute("aria-pressed"), "true");
    assert.equal(await p.locator("#cameraBtn").getAttribute("aria-pressed"), "false");
    const typingArea = await p.locator("#whiteboard svg").boundingBox();
    await p.mouse.click(typingArea.x + 40, typingArea.y + 210);
    await p.locator(".wb-editor").pressSequentially("Vamos planejar");
    assert.equal(await p.locator(".wb-editor").inputValue(), "Vamos planejar");
    assert.equal(await p.locator("#cameraBtn").getAttribute("aria-pressed"), "false");
    await p.locator('[data-tool="select"]').click();
    await p.locator('#youtubeToggleBtn').click();
    assert.ok(await p.locator('#whiteboard').isVisible());
    assert.ok(await p.locator('#youtubePanel').isVisible());
    await p.locator('#youtubeForm button').click();
    await p.waitForFunction(()=>!!window.__testPlayer);
    await p.locator('#youtubePlay').click();
    await p.waitForFunction(()=>window.__testPlayer.getPlayerState()===1);
    await p.locator('#screenBtn').click();
    assert.notEqual(await p.locator('#screenBtn').getAttribute('aria-disabled'),'true');
    await p.locator('#shareAudioCheck').uncheck();
    await p.locator('#shareConfiguredBtn').click();
    await p.waitForFunction(()=>document.querySelector('#stagePanel').dataset.panelCount==='3');
    await actualPages[1].waitForFunction(()=>document.querySelector('.screen-area').classList.contains('active'));
    for(const page of actualPages){for(const selector of ['.screen-area','#youtubePanel','#whiteboard'])assert.ok(await page.locator(selector).isVisible(),'Três recursos visíveis nas duas sessões');}
    const alive=()=>p.evaluate(()=>document.querySelector('#localScreenVideo').srcObject.getVideoTracks()[0].readyState==='live'&&window.__testPlayer.getPlayerState()===1&&window.__playerDestroyed===0);
    assert.ok(await alive());
    await p.waitForFunction(()=>document.querySelector('#youtubePanel').classList.contains('stage-compact'));
    await p.locator('[aria-controls="stageVideoControls"]').click();
    assert.ok(await p.locator('#stageVideoControls').evaluate(el=>el.open));
    assert.ok(await p.locator('#stageVideoControls #youtubeForm').isVisible());
    await p.keyboard.press('Escape');
    assert.ok(await alive());
    await p.locator('[data-stage-expand="youtube"]').click();
    await p.waitForFunction(()=>!document.querySelector('#youtubePanel').classList.contains('stage-compact'));
    assert.ok(await p.locator('#youtubePanel > #youtubeForm').isVisible());
    assert.ok(await alive());
    await p.locator('[data-stage-expand="youtube"]').click();
    await p.locator('#whiteboardBtn').click();
    assert.equal(await p.locator('#whiteboard').isVisible(),false);
    assert.ok(await alive());
    await p.locator('#whiteboardBtn').click();
    assert.equal(await p.locator('#stagePanel').getAttribute('data-panel-count'),'3');
    assert.ok(await alive());
    await p.locator('[data-stage-focus="youtube"]').click();
    assert.ok(await p.locator('#youtubePanel').evaluate(el=>el.classList.contains('stage-primary')));
    const divider=p.locator('.stage-divider');await divider.focus();await p.keyboard.press('ArrowLeft');assert.equal(await divider.getAttribute('aria-valuenow'),'58');const handle=await divider.boundingBox();await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(handle.x-50,handle.y+handle.height/2);await p.mouse.up();assert.ok(Number(await divider.getAttribute('aria-valuenow'))<58);
    await p.locator('[data-stage-expand="whiteboard"]').click();
    assert.equal(await p.locator('#youtubePanel').isVisible(),false);assert.ok(await alive());
    await p.locator('[data-stage-expand="whiteboard"]').click();
    assert.ok(await p.locator('#youtubePanel').isVisible());
    await p.locator('[data-stage-focus="whiteboard"]').click();
    await p.screenshot({path:path.join(OUTPUT_DIR,'simultaneous-desktop.png'),animations:'disabled'});
    for(const size of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]){
      await p.setViewportSize(size);
      for(const selector of ['.screen-area','#youtubePanel','#whiteboard']){const b=await p.locator(selector).boundingBox();assert.ok(b&&b.width>100&&b.height>80);assert.ok(b.x>=0&&b.x+b.width<=size.width+1);}
      assert.ok(await alive());
      await p.screenshot({path:path.join(OUTPUT_DIR,'simultaneous-'+size.width+'.png'),animations:'disabled'});
      await p.locator('[data-stage-expand="whiteboard"]').click();
      const expanded=await p.locator('#whiteboard svg').boundingBox();assert.ok(expanded.height>200);
      await p.locator('[data-stage-expand="whiteboard"]').click();
    }
    await p.setViewportSize({width:1280,height:720});
    // Encerrar só a tela não afeta os outros recursos.
    await p.locator('#screenBtn').click();
    await p.waitForFunction(()=>document.querySelector('#stagePanel').dataset.panelCount==='2');
    assert.equal(await p.evaluate(()=>window.__testPlayer.getPlayerState()),1);
    assert.ok(await p.locator('#whiteboard').isVisible());
    await p.locator('#youtubeToggleBtn').click();
    assert.ok(await p.locator('#whiteboard').isVisible());
    assert.equal(await p.locator('#stagePanel').getAttribute('data-panel-count'),'1');
    await p.locator('[data-tool="select"]').click();
    await p.screenshot({ path: path.join(OUTPUT_DIR, "whiteboard-validation.png"), animations: "disabled" });
    await p.locator('[data-action="shortcuts"]').click();
    await p.waitForFunction(() => getComputedStyle(document.querySelector("#wbShortcutsDialog")).opacity === "1");
    await p.screenshot({ path: path.join(OUTPUT_DIR, "whiteboard-shortcuts-validation.png"), animations: "disabled" });
    await p.keyboard.press("Escape");
    for (const size of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await p.setViewportSize(size);
      const bounds = await p.locator("#whiteboard").boundingBox();
      const svg = await p.locator("#whiteboard svg").boundingBox();
      assert.ok(bounds.width > 200 && svg.height > 80, "Área útil do quadro");
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= size.width + 1, "Quadro cabe na largura");
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Sem rolagem horizontal");
      const controls = await p.locator("#mediaModeSwitch").evaluate((el) => [...el.querySelectorAll("#screenBtn,#youtubeToggleBtn,#whiteboardBtn")].map((b2) => {
        const r = b2.getBoundingClientRect();
        return { x: r.x, right: r.right };
      }));
      assert.ok(controls.every((r) => r.x >= 0 && r.right <= size.width), "Botões de modo cabem na tela");
      await p.locator('[data-action="fit"]').click();
      await p.screenshot({ path: path.join(OUTPUT_DIR, "whiteboard-" + size.width + "-validation.png"), animations: "disabled" });
    }
    console.log("PASS: painéis simultâneos nas duas sessões, faixa WebRTC ativa, player preservado, destaque, ampliação, divisor e layouts responsivos.");
    console.log("PASS: duas sessões, 8 ferramentas, sincronização, undo/redo, permissões diretas, isolamento, reabertura, reconexão e PNG/PDF.");
  } catch (error) {
    for (const [i, context] of (browser?.contexts() || []).entries()) {
      const page = context.pages()[0];
      if (page) await page.screenshot({ path: path.join(OUTPUT_DIR, "whiteboard-failure-" + i + ".png") }).catch(() => {
      });
    }
    throw error;
  } finally {
    await browser?.close();
    server.kill();
    await new Promise((r) => server.exitCode !== null ? r() : server.once("exit", r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
