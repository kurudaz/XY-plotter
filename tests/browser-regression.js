async (page) => {
  const results = [];
  async function ready(name) {
    await page.waitForFunction(() => !!window.stageLayerExport?.report || document.getElementById('stage-status')?.textContent.includes('匯出失敗'), null, { timeout: 30000 });
    const report = await page.evaluate(() => window.stageLayerExport.report);
    if (!report) throw new Error(await page.locator('#stage-status').textContent());
    if (report.comparison.differentPixels || report.previewComparison.differentPixels || report.roundTrip.differentPixels) throw new Error(name + ': pixel mismatch');
    results.push({ name, mode: report.mode, split: report.split, layers: report.layerCount, error: report.roundTrip.maxChannelError });
    return report;
  }
  await page.goto('http://127.0.0.1:4187/');
  await ready('default plotter, natural completion');
  await page.evaluate(() => { document.getElementById('param-ink-color').value='#8f244f'; document.getElementById('param-line-brush').value='pencil'; });
  await page.waitForFunction(() => window.stageLayerExport.report?.params.inkColor === '#8f244f');
  await ready('style changed after completion');
  await page.evaluate(() => {
    sourceCanvas.width=320; sourceCanvas.height=240;
    sourceCtx.fillStyle='#f1dfb9'; sourceCtx.fillRect(0,0,320,240);
    sourceCtx.fillStyle='#b63840'; sourceCtx.fillRect(20,20,110,180);
    sourceCtx.fillStyle='#3679b3'; sourceCtx.beginPath(); sourceCtx.arc(210,125,75,0,Math.PI*2); sourceCtx.fill();
    document.getElementById('stage-split').value='stages';
    document.getElementById('param-wc-overlay').checked=true;
    document.getElementById('mode-watercolor').click();
  });
  const stages = await ready('color stages and contour, natural completion');
  if (!stages.checkpoints.at(-1).name.includes('淡彩線稿輪廓')) throw new Error('Missing contour layer');
  await page.selectOption('#stage-split', 'percent');
  const percent = await ready('color percent split');
  if (percent.layerCount !== 12) throw new Error('Expected paper + 10 intervals + contour');
  await page.evaluate(() => { document.getElementById('param-wc-grain').value='0'; document.getElementById('param-paper').value='dark'; });
  await page.waitForFunction(() => window.stageLayerExport.report?.params.paper==='dark');
  await ready('dark paper and no grain');
  await page.evaluate(() => { document.getElementById('btn-reprocess').click(); });
  await page.waitForFunction(() => document.getElementById('processing-badge').classList.contains('hidden'));
  await page.click('#btn-instant');
  await ready('instant completion includes contour');
  await page.evaluate(() => {
    sourceCanvas.width=64; sourceCanvas.height=64; sourceCtx.fillStyle='white'; sourceCtx.fillRect(0,0,64,64);
    document.getElementById('mode-plotter').click();
  });
  const empty = await ready('empty image retains ten named intervals');
  if (empty.layerCount!==11 || empty.checkpoints.some(c => c.changedPixels!==0)) throw new Error('Empty image has unexpected marks');
  await page.evaluate(() => {
    document.querySelector('[data-sample="mandala"]').click();
    document.querySelector('[data-sample="botanical"]').click();
    document.querySelector('[data-sample="manga"]').click();
  });
  const switched = await ready('rapid source changes discard stale exports');
  if (switched.width!==480 || switched.height!==480) throw new Error('Stale dimensions');
  // Also compare independent PhotoCraft CLI renders to the downloadable references.
  const imports = await page.evaluate(async () => {
    const output=[];
    for(const name of ['xy-plotter-percent','xy-watercolor-stages']) {
      const images=[];
      for(const suffix of ['final','photocraft']) {
        const response=await fetch('/examples/'+name+'-'+suffix+'.png');
        if (!response.ok) throw new Error('Missing PhotoCraft comparison fixture');
        const bitmap=await createImageBitmap(await response.blob());
        const canvas=document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d'); ctx.drawImage(bitmap,0,0);
        images.push(ctx.getImageData(0,0,canvas.width,canvas.height).data); bitmap.close();
      }
      let errors=0;
      for(let i=0;i<images[0].length;i++) if(images[0][i]!==images[1][i]) errors++;
      if(errors) throw new Error(name+': PhotoCraft image mismatch');
      output.push({name, differentChannels: errors});
    }
    return output;
  });
  return { cases: results, photocraft: imports };
}
