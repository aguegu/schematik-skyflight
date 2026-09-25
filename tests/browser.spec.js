import { test, expect } from '@playwright/test';

test('renders branded plane, launches, scores, steers, pauses and restarts',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');
  await expect(page.locator('#world canvas')).toBeVisible();
  await page.waitForTimeout(1600);
  await page.screenshot({path:'test-results/skyflight-menu.png'});
  await page.getByRole('button',{name:'Let’s fly'}).click();
  await expect(page.locator('#game-hud')).toBeVisible();
  await expect(page.locator('#score')).not.toHaveText('0000',{timeout:12000});
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(800);
  await page.screenshot({path:'test-results/skyflight-flight.png'});
  await expect(page.locator('#roll-value')).not.toHaveText('+00.0°');
  await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowUp');
  await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();
  const time=await page.locator('#timer').innerText();await page.waitForTimeout(500);await expect(page.locator('#timer')).toHaveText(time);
  await page.getByRole('button',{name:'Back to the sky'}).click();await expect(page.locator('#pause-panel')).toBeHidden();
  await page.getByRole('button',{name:'Controller',exact:false}).first().click();await expect(page.locator('#settings-dialog')).toBeVisible();
  await expect(page.locator('#calibrate-button')).toBeDisabled();
  await page.getByRole('button',{name:'Close controller settings'}).click();
  await page.getByRole('button',{name:'End flight & return'}).click();await expect(page.locator('#intro')).toBeVisible();
  await page.getByRole('button',{name:'Free flight'}).click();await page.getByRole('button',{name:'Let’s fly'}).click();
  await expect(page.locator('#timer-label')).toHaveText('FLIGHT TIME');
  expect(errors).toEqual([]);
});

test('serial stream calibrates, controls plane, pauses on stall and disconnects',async({page})=>{
  await page.addInitScript(()=>{
    let source,timer;
    window.testTilt={roll:10,pitch:5,stream:true};
    const encoder=new TextEncoder();
    Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>({
      open:async()=>{},close:async()=>{},
      readable:new ReadableStream({start(controller){source=controller;timer=setInterval(()=>{if(window.testTilt.stream)source.enqueue(encoder.encode(`${window.testTilt.roll},${window.testTilt.pitch}\n`));},20);},cancel(){clearInterval(timer);}}),
    })}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Connect MPU6050'}).click();
  await expect(page.locator('#input-label')).toHaveText('MPU6050 / LIVE TILT');
  await expect(page.locator('#roll-value')).toHaveText('+00.0°');
  await page.getByRole('button',{name:'Let’s fly'}).click();
  await page.evaluate(()=>{window.testTilt.roll=30;window.testTilt.pitch=20;});
  await expect(page.locator('#roll-value')).toHaveText('+20.0°');
  await page.keyboard.press('c');await expect(page.locator('#roll-value')).toHaveText('+00.0°');
  await page.evaluate(()=>{window.testTilt.stream=false;});
  await expect(page.locator('#pause-panel')).toBeVisible({timeout:4000});
  await expect(page.locator('#input-label')).toHaveText('KEYBOARD CONTROL');
  await page.getByRole('button',{name:'Controller',exact:false}).first().click();
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
  await expect(page.locator('#connect-label')).toHaveText('Connect MPU6050');
});

test.describe('touchscreen',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('mobile landing and touch controls remain usable',async({page})=>{
    await page.goto('/');
    await expect(page.locator('#world canvas')).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(page.locator('#start-button')).toBeInViewport();
    await page.screenshot({path:'test-results/skyflight-mobile.png'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow).toBe(false);
    await page.getByRole('button',{name:'Let’s fly'}).tap();
    await expect(page.locator('#touch-controls')).toBeVisible();
    const button=page.getByRole('button',{name:'Bank right'});
    const bounds=await button.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();await page.waitForTimeout(350);
    await expect(page.locator('#roll-value')).not.toHaveText('+00.0°');
    await page.mouse.up();
  });
});
